/** The main window's host (host.tsx) with the app, the IAM SDK and Tauri replaced: what the host itself decides. */
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const iam = vi.hoisted(() => ({ state: { isLoading: false, isAuthenticated: false, sdk: {} } }));
// The window loads onto /pricing, as the guest Rail's Upgrade does (`location.assign`).
vi.hoisted(() => window.history.replaceState(null, '', '/pricing'));
// The network the host's fetch bridge wraps: offline. Set before host.tsx is imported, which is when it wraps.
vi.hoisted(() => {
  window.fetch = (async () => {
    throw new TypeError('Failed to fetch');
  }) as typeof window.fetch;
});

// The window menu's events (main.rs), captured so a test can send one.
const menu = vi.hoisted(() => ({ on: new Map<string, (e: { payload: unknown }) => void>() }));
vi.mock('../utils/tauri-check', () => ({
  isTauriAvailable: () => false,
  safeInvoke: vi.fn(async () => null),
  safeListen: vi.fn(async (name: string, fn: (e: { payload: unknown }) => void) => {
    menu.on.set(name, fn);
    return () => menu.on.delete(name);
  }),
}));

vi.mock('@hanzo/app', () => ({
  configure: vi.fn(),
  dispatchTabsAction: vi.fn(),
  Look: () => null,
  Rooms: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@hanzo/app/App', () => ({ App: () => <div>the app</div> }));
vi.mock('@hanzo/app/open', () => ({ empty: vi.fn() }));
vi.mock('@hanzo/gui', () => ({
  GuiProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  XStack: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@hanzo/ui', () => ({
  Button: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
vi.mock('@hanzo/appearance', () => ({ useScheme: () => 'dark' }));
vi.mock('@hanzo/iam/react', () => ({
  IamProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useIam: () => iam.state,
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => null) }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn() }));
vi.mock('../../gui.config', () => ({ default: {} }));
vi.mock('../identity', () => ({ adopt: vi.fn(async () => false), share: vi.fn(), forget: vi.fn(async () => undefined) }));
vi.mock('../update', () => ({ Update: () => null }));
vi.mock('../Welcome', () => ({
  Welcome: ({ onSkip }: { onSkip: () => void }) => (
    <button type="button" onClick={onSkip}>
      welcome: not now
    </button>
  ),
}));
vi.mock('../local-ai', () => ({
  buildLocalModelsCatalogResponse: vi.fn(async () => ({ data: [] })),
  LocalAiManager: () => null,
  localChat: vi.fn(),
  openLocalAiManager: vi.fn(),
}));
vi.mock('../desktop-shortcuts', () => ({
  windowKey: (e: KeyboardEvent) => (e.metaKey && e.key === 'n' ? 'new-chat' : null),
  DesktopSettings: ({ onBack }: { onBack: () => void }) => (
    <button type="button" onClick={onBack}>
      Settings back
    </button>
  ),
}));

import { configure, dispatchTabsAction } from '@hanzo/app';
import { empty } from '@hanzo/app/open';
import { openUrl } from '@tauri-apps/plugin-opener';
import { Host } from '../host';
import { forget } from '../identity';
import { localChat } from '../local-ai';
import { keychain } from '../keychain';

// What host.tsx did with that page load, before any test clears the mock.
const atLoad = { opened: vi.mocked(openUrl).mock.calls.map(([url]) => url), at: window.location.pathname };

const GUEST = 'hanzo:guest';

async function open(path: string) {
  window.history.replaceState(null, '', path);
  render(<Host />);
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe('Host', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    iam.state = { isLoading: false, isAuthenticated: false, sdk: {} };
  });

  it('brings a signed-in person back from Settings signed in, never a guest', async () => {
    iam.state = { isLoading: false, isAuthenticated: true, sdk: {} };
    await open('/settings');
    fireEvent.click(screen.getByText('Settings back'));
    expect(window.location.pathname).toBe('/chat');
    expect(window.localStorage.getItem(GUEST)).toBeNull();
  });

  it('opens the window’s Settings on Local models from any signed-out Settings door, and lets the app close its own pane', async () => {
    await open('/chat');
    fireEvent.click(screen.getByText('welcome: not now'));
    expect(screen.getByText('the app')).toBeTruthy();
    // What the app's doors raise signed out (Rail's mark, ⌘,, the palette, a row's menu).
    act(() => {
      window.dispatchEvent(new CustomEvent('hanzo:anon-settings', { detail: { open: false } }));
    });
    expect(window.location.pathname).toBe('/chat');
    act(() => {
      window.dispatchEvent(new CustomEvent('hanzo:anon-settings', { detail: { open: true } }));
    });
    expect(window.location.pathname).toBe('/settings/local-models');
    expect(screen.getByText('Settings back')).toBeTruthy();
    window.history.replaceState(null, '', '/chat');
    act(() => {
      window.dispatchEvent(new CustomEvent('hanzo:anon-settings'));
    });
    expect(window.location.pathname).toBe('/settings/local-models');
  });

  it('answers a signed-out turn through the app’s one seam: configure({ local }) is the engine on this computer', () => {
    const stated = vi.mocked(configure).mock.calls.map(([given]) => given);
    expect(stated.filter((g) => 'local' in g).map((g) => g.local)).toEqual([{ chat: localChat }]);
  });

  it('states the Tabs workspace through the app’s one seam: configure({ tabs }) turns on shortcuts and a minimum pane', () => {
    const stated = vi.mocked(configure).mock.calls.map(([given]) => given);
    expect(stated.filter((g) => 'tabs' in g).map((g) => g.tabs)).toEqual([{ shortcuts: true, minPane: 420 }]);
  });

  it('gives one split per menu action: one tabs-split event is one split sent to the workspace', async () => {
    await open('/tabs');
    vi.mocked(dispatchTabsAction).mockClear();
    act(() => menu.on.get('tabs-split')!({ payload: 'row' }));
    expect(vi.mocked(dispatchTabsAction).mock.calls).toEqual([[{ kind: 'split', dir: 'row' }]]);
  });

  it('owns sign-out through the app’s one seam: configure({ signOut }) is forget, and nothing else is stated', () => {
    const stated = vi.mocked(configure).mock.calls.map(([given]) => given);
    expect(stated.filter((g) => 'signOut' in g).map((g) => g.signOut)).toEqual([forget]);
    expect(stated.some((g) => 'track' in g)).toBe(false);
  });

  it('clears an old guest flag once signed in, so a later sign-out opens on Welcome', async () => {
    window.localStorage.setItem(GUEST, '1');
    iam.state = { isLoading: false, isAuthenticated: true, sdk: {} };
    await open('/chat');
    expect(screen.getByText('the app')).toBeTruthy();
    expect(window.localStorage.getItem(GUEST)).toBeNull();
  });

  it('marks nobody a guest while sign-in is still being read', async () => {
    iam.state = { isLoading: true, isAuthenticated: false, sdk: {} };
    await open('/settings');
    fireEvent.click(screen.getByText('Settings back'));
    expect(window.localStorage.getItem(GUEST)).toBeNull();
  });

  it('brings a signed-out person back from Settings to Welcome, not into Chat as a guest', async () => {
    await open('/settings');
    fireEvent.click(screen.getByText('Settings back'));
    expect(window.location.pathname).toBe('/chat');
    expect(screen.getByText('welcome: not now')).toBeTruthy();
    expect(window.localStorage.getItem(GUEST)).toBeNull();
  });

  it('⌘N on Welcome does nothing: no guest, no new chat, and the address keeps its next', async () => {
    vi.mocked(empty).mockClear();
    await open('/login?next=/settings/appearance');
    fireEvent.keyDown(window, { key: 'n', metaKey: true });
    expect(screen.getByText('welcome: not now')).toBeTruthy();
    expect(screen.queryByText('the app')).toBeNull();
    expect(`${window.location.pathname}${window.location.search}`).toBe('/login?next=/settings/appearance');
    expect(window.localStorage.getItem(GUEST)).toBeNull();
    expect(empty).not.toHaveBeenCalled();
  });

  it('an address does not make a guest: ?guest=1 still opens on Welcome', async () => {
    await open('/chat?guest=1');
    expect(screen.getByText('welcome: not now')).toBeTruthy();
    expect(window.localStorage.getItem(GUEST)).toBeNull();
  });

  it('Welcome’s Not now is the one way in as a guest, and it is remembered', async () => {
    await open('/chat');
    fireEvent.click(screen.getByText('welcome: not now'));
    expect(screen.getByText('the app')).toBeTruthy();
    expect(window.localStorage.getItem(GUEST)).toBe('1');
  });

  describe('offline', () => {
    const API = 'https://api.hanzo.ai';
    const guestChats = [{ id: 'local-1', title: 'a guest chat', updatedAt: '', createdAt: '', messages: [] }];
    beforeEach(() => {
      window.localStorage.setItem('hanzo:local:conversations', JSON.stringify(guestChats));
    });
    afterEach(() => keychain.clear());

    it('never answers a signed-in window itself: every call fails as the network failed', async () => {
      keychain.setItem('hanzo_iam_access_token', 'signed-in');
      await expect(window.fetch(`${API}/v1/agents/chat/conversations`)).rejects.toThrow('Failed to fetch');
      await expect(
        window.fetch(`${API}/v1/agents/chat/conversations`, { method: 'POST', body: '{"messages":[]}' }),
      ).rejects.toThrow('Failed to fetch');
      await expect(window.fetch(`${API}/v1/pref`, { method: 'POST', body: '{}' })).rejects.toThrow('Failed to fetch');
      // No side list is made up either: the app shows its own error for each.
      for (const path of ['/v1/agents', '/v1/agent/sessions', '/v1/project', '/v1/pref']) {
        await expect(window.fetch(`${API}${path}`)).rejects.toThrow('Failed to fetch');
      }
    });

    it('still answers a guest from the chats on this computer', async () => {
      const res = await window.fetch(`${API}/v1/agents/chat/conversations`);
      expect((await res.json()).conversations.map((c: { id: string }) => c.id)).toEqual(['local-1']);
    });
  });

  it('a page load onto /pricing opens hanzo.ai’s pricing in the browser and shows Chat', () => {
    expect(atLoad).toEqual({ opened: ['https://hanzo.ai/pricing'], at: '/chat' });
  });

  it.each([
    ['/settings/organization', 'https://hanzo.ai/settings/organization'],
    ['/settings/organization/members', 'https://hanzo.ai/settings/organization/members'],
    ['/billing', 'https://hanzo.ai/pay'],
    ['/billing/invoices', 'https://hanzo.ai/pay/invoices'],
    ['/usage', 'https://hanzo.ai/pay/usage'],
    ['/keys', 'https://platform.hanzo.ai/api-keys'],
    ['/pricing', 'https://hanzo.ai/pricing'],
  ])(
    '%s opens %s in the browser, and the window stays where it was',
    (address, expected) => {
      window.history.replaceState(null, '', '/chat');
      vi.mocked(openUrl).mockClear();
      window.history.pushState(null, '', address);
      expect(openUrl).toHaveBeenCalledWith(expected);
      expect(window.location.pathname).toBe('/chat');
    },
  );

  it.each(['/settings/account', '/settings/organization/billing', '/settings/organization/usage'])(
    '%s is drawn in-window and not sent away',
    (address) => {
      vi.mocked(openUrl).mockClear();
      window.history.pushState(null, '', address);
      expect(openUrl).not.toHaveBeenCalled();
      expect(window.location.pathname).toBe(address);
    },
  );
});

