/**
 * Sign-out in the window, through @hanzo/app's own code paths (lib/signout `useSignOut`,
 * lib/accounts `leave`): the host's `configure({ signOut })` (host.tsx states identity.ts
 * `forget`, host.test.tsx proves it) is awaited before IAM's session is ended or the page
 * moves; a token that expires never calls it.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const iam = vi.hoisted(() => ({ state: {} as Record<string, unknown> }));
const invoke = vi.hoisted(() => vi.fn());
vi.mock('@hanzo/iam/react', () => ({ useIam: () => iam.state }));
vi.mock('@tauri-apps/api/core', () => ({ invoke }));

import { configure } from '@hanzo/app';
import { useAccounts } from '@hanzo/app/lib/accounts';
import { useAi } from '@hanzo/app/lib/ai';
import { useSignOut } from '@hanzo/app/lib/signout';
import { useUnfinished } from '@hanzo/app/lib/unfinished';
import { IAM } from '@hanzo/iam';
import { toast } from '@hanzo/ui';

import { forget, SESSION } from '../identity';
import { keychain } from '../keychain';

const jwt = (claims: object) => {
  const e = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${e({ alg: 'none' })}.${e(claims)}.sig`;
};
const config = { serverUrl: 'https://api.hanzo.ai', clientId: 'hanzo-app', redirectUri: 'http://127.0.0.1/callback', storage: keychain };

/** What happened, in order: the host's forgetting finishing, and every network call. */
let order: string[] = [];

beforeEach(() => {
  order = [];
  keychain.clear();
  keychain.setItem(SESSION.access, jwt({ owner: 'hanzo', name: 'z', exp: Math.floor(Date.now() / 1000) + 3600 }));
  configure({ signOut: forget });
  invoke.mockReset();
  invoke.mockImplementation(async (cmd: string) => {
    await new Promise((r) => setTimeout(r, 20)); // a revoke over the network takes a moment
    order.push(cmd);
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      order.push(`${init?.method ?? 'GET'} ${path}`);
      if (path === '/v1/iam/accounts') {
        return new Response(JSON.stringify([{ sub: 'u1', name: 'z', email: 'z@acme.test' }]), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

/**
 * Whether the next page says the app's note, read the way the app reads it
 * (lib/unfinished `useUnfinished`, which every page mounts), not by its storage
 * format: the app owns that, its freshness and whom it is for.
 */
function nextPageSaysTheNote(): boolean {
  const said = vi.spyOn(toast, 'error').mockImplementation(() => '' as never);
  renderHook(() => useUnfinished());
  return said.mock.calls.some(([text]) => /could not finish forgetting you/.test(String(text)));
}

describe('signing out of the window', () => {
  it('Log out, Sign out of all accounts and the palette (useSignOut): the identity is forgotten before the session ends', async () => {
    const sdk = { clearTokens: vi.fn(() => order.push('session cleared')) };
    iam.state = { config, sdk };
    const { result } = renderHook(() => useSignOut());
    await act(async () => {
      await result.current();
    });
    expect(order[0]).toBe('identity_forget');
    expect(order).toContain('session cleared');
    expect(order.indexOf('identity_forget')).toBeLessThan(order.indexOf('session cleared'));
    expect(order.filter((o) => o.startsWith('POST')).every((o) => order.indexOf(o) > 0)).toBe(true);
    // Forgetting finished, so the next page has nothing to say.
    expect(nextPageSaysTheNote()).toBe(false);
  });

  it('Sign out <name> on the account in use (useAccounts().leave): the identity is forgotten before IAM ends the session', async () => {
    iam.state = { config, user: { sub: 'u1', email: 'z@acme.test', name: 'z' }, isAuthenticated: true };
    const { result } = renderHook(() => useAccounts());
    await waitFor(() => expect(result.current.current?.sub).toBe('u1'));
    order = [];
    await act(async () => {
      await result.current.leave(result.current.current!);
    });
    expect(order[0]).toBe('identity_forget');
    expect(order.indexOf('identity_forget')).toBeLessThan(order.indexOf('POST /v1/iam/oauth/logout'));
  });

  it('the app’s own expiry handling (useAi, the token every API call takes) ends the session without signing the identity out', async () => {
    keychain.setItem(SESSION.access, jwt({ owner: 'hanzo', name: 'z', exp: 1 }));
    keychain.setItem(SESSION.expires, '1000');
    const sdk = new IAM(config);
    const valid = vi.spyOn(sdk, 'getValidAccessToken');
    iam.state = { sdk, isAuthenticated: true };
    const { result } = renderHook(() => useAi());
    await act(async () => {
      await result.current.client.models.list().catch(() => undefined);
    });
    // The app's call asked the SDK for a valid token, and there was none to be had.
    expect(valid).toHaveBeenCalled();
    await expect(valid.mock.results[0].value).resolves.toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('a forgetting that fails still signs out, and leaves the app’s note for the next page', async () => {
    invoke.mockRejectedValue('Signed out on this computer, but the server could not confirm it: it could not be reached.');
    const sdk = { clearTokens: vi.fn(() => order.push('session cleared')) };
    iam.state = { config, sdk };
    const { result } = renderHook(() => useSignOut());
    await act(async () => {
      await result.current();
    });
    expect(invoke).toHaveBeenCalledWith('identity_forget', expect.anything());
    expect(order).toContain('session cleared');
    expect(nextPageSaysTheNote()).toBe(true);
  });

  it('a forgetting that does not finish in 5 seconds still signs out, with the note', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      invoke.mockImplementation(() => new Promise(() => undefined));
      const sdk = { clearTokens: vi.fn(() => order.push('session cleared')) };
      iam.state = { config, sdk };
      const { result } = renderHook(() => useSignOut());
      let done = false;
      const signing = act(async () => {
        await result.current();
        done = true;
      });
      await vi.advanceTimersByTimeAsync(4900);
      expect(order).not.toContain('session cleared');
      await vi.advanceTimersByTimeAsync(200);
      await vi.waitFor(() => expect(done).toBe(true));
      // Closed before the next page is drawn: an open act holds that page's effects back.
      await signing;
      expect(order).toContain('session cleared');
      expect(nextPageSaysTheNote()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
