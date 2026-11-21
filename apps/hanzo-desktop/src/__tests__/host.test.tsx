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

vi.mock('@hanzo/app', () => ({
  configure: vi.fn(),
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
vi.mock('../identity', () => ({ adopt: vi.fn(async () => false), share: vi.fn() }));
vi.mock('../update', () => ({ Update: () => null }));
vi.mock('../Welcome', () => ({ Welcome: () => <div>welcome</div> }));
vi.mock('../local-ai', () => ({
  buildLocalModelsCatalogResponse: vi.fn(async () => ({ data: [] })),
  handleLocalChatCompletion: vi.fn(),
  LocalAiManager: () => null,
  openLocalAiManager: vi.fn(),
}));
vi.mock('../desktop-shortcuts', () => ({
  windowKey: () => null,
  DesktopSettings: ({ onBack }: { onBack: () => void }) => (
    <button type="button" onClick={onBack}>
      Settings back
    </button>
  ),
}));

import { openUrl } from '@tauri-apps/plugin-opener';
import { Host } from '../host';
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

  it('brings a signed-out person back from Settings into Chat as a guest', async () => {
    await open('/settings');
    fireEvent.click(screen.getByText('Settings back'));
    expect(window.location.pathname).toBe('/chat');
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

  it.each(['/settings/organization', '/settings/organization/members', '/billing', '/usage', '/keys', '/pricing'])(
    '%s opens on hanzo.ai in the browser, and the window stays where it was',
    (address) => {
      window.history.replaceState(null, '', '/chat');
      vi.mocked(openUrl).mockClear();
      window.history.pushState(null, '', address);
      expect(openUrl).toHaveBeenCalledWith(`https://hanzo.ai${address}`);
      expect(window.location.pathname).toBe('/chat');
    },
  );

  it('an address the window draws is not sent away', () => {
    vi.mocked(openUrl).mockClear();
    window.history.pushState(null, '', '/settings/account');
    expect(openUrl).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/settings/account');
  });
});

