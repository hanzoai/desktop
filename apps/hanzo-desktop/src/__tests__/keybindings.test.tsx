import { KEYS, asked, chip } from '@hanzo/app/help';
import { handle } from '@hanzo/app/keys';
import * as keymap from '@hanzo/dev-core/keymap';
import { chord } from '@hanzo/app/chord';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { GuiProvider } from '@hanzo/gui';
import { readFileSync } from 'fs';
import type { ReactNode } from 'react';
import { resolve } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DESKTOP_KEYS,
  DesktopSettings,
  localModelsStatus,
  platformOf,
  shortcutGroups,
  windowKey,
} from '../desktop-shortcuts';
import { LocalAiManager } from '../local-ai';
import config from '../../gui.config';

/** A section's entry in the side nav (the phone-width chips repeat it). */
const entry = (name: string) => within(screen.getAllByRole('navigation', { name: 'Settings' })[0]).getByText(name);

const gui = (ui: ReactNode) => (
  <GuiProvider config={config} defaultTheme="dark">
    {ui}
  </GuiProvider>
);

describe('Hanzo Desktop & @hanzo/app keybindings', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('lists every core Web + Desktop shortcut in KEYS and DESKTOP_KEYS', () => {
    const macChords = [...KEYS, ...DESKTOP_KEYS].map((k) => k.mac);
    expect(macChords).toContain('⌘K');
    expect(macChords).toContain('⌘⇧O');
    expect(macChords).toContain('⌘N');
    expect(macChords).toContain('⌘B');
    expect(macChords).toContain('⌘⇧M');
    expect(macChords).toContain('⇧⌘I');
    expect(macChords).toContain('⌘,');
    expect(macChords).toContain('⌘/');
    expect(macChords).toContain('⌘.');
    expect(macChords).toContain('⌘U');
    expect(macChords).toContain('⌃⌥R');
    expect(macChords).toContain('⌃⌥P');
    expect(macChords).toContain('⌘[');
    expect(macChords).toContain('⌘]');

    // main.rs registers ⇧⌘I system-wide (⇧⌘J waits until Spotlight can send);
    // Fn never reaches a window on Windows or Linux and is the Globe key on a
    // Mac, so it is not listed.
    const all = shortcutGroups('mac').flatMap((g) => g.rows.flatMap((r) => r.keys));
    expect(all.join(' ')).not.toMatch(/Fn/);
  });

  it('recognizes palette (⌘K), shortcuts dialog (⌘/), and conversation chords (⌃⌥R / ⌃⌥P)', () => {
    // ⌘K is @hanzo/app's one key handler (keys.js `handle`, over Dev's keymap); seek.js's
    // `summons` is gone from 0.3.149. The keymap reads "mod" from the platform: a Mac here.
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    const find = vi.fn();
    expect(
      handle(
        {
          defaultPrevented: false,
          metaKey: true,
          ctrlKey: false,
          altKey: false,
          shiftKey: false,
          repeat: false,
          isComposing: false,
          key: 'k',
          code: 'KeyK',
          target: document.body,
          preventDefault: vi.fn(),
        } as unknown as Parameters<typeof handle>[0],
        { find, newChat: vi.fn(), sidebar: vi.fn(), settings: vi.fn(), desktop: true },
        (s) => s,
        keymap,
      ),
    ).toBe(true);
    expect(find).toHaveBeenCalledTimes(1);

    expect(
      asked({
        metaKey: true,
        ctrlKey: false,
        altKey: false,
        repeat: false,
        key: '/',
      }),
    ).toBe(true);

    expect(
      chord({
        ctrlKey: true,
        altKey: true,
        metaKey: false,
        shiftKey: false,
        repeat: false,
        isComposing: false,
        key: 'r',
        code: 'KeyR',
        target: document.body,
      }),
    ).toBe('rename');

    expect(
      chord({
        ctrlKey: true,
        altKey: true,
        metaKey: false,
        shiftKey: false,
        repeat: false,
        isComposing: false,
        key: 'p',
        code: 'KeyP',
        target: document.body,
      }),
    ).toBe('pin');
  });

  it('renders DesktopSettings: shortcuts, theme, and Back on Escape or ⌘[', () => {
    const onBack = vi.fn();
    window.history.replaceState(null, '', '/settings/shortcuts');
    render(gui(<DesktopSettings isAuthenticated={false} onBack={onBack} onSignIn={vi.fn()} />));

    expect(screen.getByTestId('desktop-settings-page')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Keyboard shortcuts' })).toBeTruthy();
    expect(screen.queryByText('Hanzo Spotlight')).toBeNull();

    // Theme is Appearance's: one press there, and the document follows.
    fireEvent.click(entry('Appearance'));
    fireEvent.click(screen.getByTestId('desktop-theme-light'));
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(screen.getByTestId('desktop-theme-light')).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByTestId('desktop-theme-dark'));
    expect(document.documentElement.classList.contains('light')).toBe(false);
    expect(window.localStorage.getItem('hanzo.appearance')).toContain('"dark"');

    // Escape triggers onBack
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('spells every shortcut for the platform it runs on', () => {
    expect(platformOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('mac');
    expect(platformOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('other');
    expect(platformOf('Mozilla/5.0 (X11; Linux x86_64)')).toBe('other');

    const mac = shortcutGroups('mac');
    const pc = shortcutGroups('other');
    const keysOf = (groups: typeof mac, does: string) =>
      groups.flatMap((g) => g.rows).find((r) => r.does === does)?.keys;
    const rowsOf = (groups: typeof mac, does: string) => groups.flatMap((g) => g.rows).filter((r) => r.does === does).map((r) => r.keys);
    // ONE row: the app's key, the window's ⌘N and the desktop's system-wide ⇧⌘I as three keycaps.
    expect(rowsOf(mac, 'New chat')).toEqual([['⌘⇧O', '⌘N', '⇧⌘I']]);
    expect(rowsOf(pc, 'New chat')).toEqual([['Ctrl+Shift+O', 'Ctrl+N', 'Ctrl+Shift+I']]);
    expect(keysOf(mac, 'Hanzo Spotlight')).toBeUndefined();
    // No ⌘ anywhere a PC reader looks, and every app key is listed once.
    expect(pc.flatMap((g) => g.rows.flatMap((r) => r.keys)).join(' ')).not.toMatch(/[⌘⌥⇧⌃]/);
    // No action is listed twice.
    const names = mac.flatMap((g) => g.rows.map((r) => r.does));
    expect(new Set(names).size).toBe(names.length);
    expect(mac.flatMap((g) => g.rows.flatMap((r) => r.keys))).toHaveLength(KEYS.length + DESKTOP_KEYS.length);
  });

  it('shows the Back shortcut that works on this platform', () => {
    const onBack = vi.fn();
    render(gui(<DesktopSettings isAuthenticated onBack={onBack} onSignIn={vi.fn()} />));
    // jsdom reads as Linux: Alt+← is Back there, ⌘[ is a Mac's.
    fireEvent.keyDown(window, { key: '[', metaKey: true });
    expect(onBack).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'ArrowLeft', altKey: true });
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('says the local models status in one plain line', () => {
    expect(localModelsStatus(null, null).label).toBe('Checking…');
    expect(localModelsStatus(0, 'Zen Nano')).toMatchObject({ label: 'Not set up' });
    expect(localModelsStatus(0, null)).toMatchObject({ label: 'Not set up' });
    // Downloaded models answer nothing without an engine, so that is said first.
    expect(localModelsStatus(2, null, false)).toEqual({
      label: 'Not set up',
      detail: 'Hanzo’s engine, which runs models on this computer, is not installed.',
    });
    expect(localModelsStatus(2, null, true)).toMatchObject({ label: 'Ready' });
    // The engine serves one model, so it is named, never counted.
    expect(localModelsStatus(2, 'Zen Nano')).toEqual({ label: 'Running', detail: 'The Hanzo engine is running Zen Nano.' });
    expect(localModelsStatus(1, null)).toEqual({ label: 'Ready', detail: '1 model on this computer can answer your chats.' });
    // Signed in, chat goes to the cloud: the line must not promise local answers.
    expect(localModelsStatus(1, null, true, true)).toEqual({
      label: 'Ready',
      detail: '1 model on this computer. You are signed in, so chat uses Hanzo’s cloud models.',
    });
    expect(localModelsStatus(1, 'Zen Nano', true, true).detail).toBe(
      'The Hanzo engine is running Zen Nano. You are signed in, so chat uses Hanzo’s cloud models.',
    );
  });

  it('keeps ports out of the Local models card and puts them under Advanced', async () => {
    // Nothing local answers here, whatever this machine happens to be running.
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));
    window.history.replaceState(null, '', '/settings/local-models');
    render(gui(<DesktopSettings isAuthenticated onBack={vi.fn()} onSignIn={vi.fn()} />));
    const card = screen.getByTestId('desktop-local-models');
    expect(card.textContent).not.toMatch(/36900|9630|127\.0\.0\.1|hanzod/);
    expect(screen.getByRole('button', { name: 'Manage local models' })).toBeTruthy();
    expect(await screen.findByText('Not set up')).toBeTruthy();

    fireEvent.click(entry('Advanced'));
    const advanced = screen.getByTestId('desktop-advanced');
    expect(advanced.textContent).toMatch(/127\.0\.0\.1:9630/);
    expect(advanced.textContent).toMatch(/127\.0\.0\.1:36900/);
  });

  it.each([false, true])(
    'reaches the Local AI screen by clicking from Settings’ first page, signed in: %s',
    async (signedIn) => {
      vi.stubGlobal('fetch', vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }));
      // Where every Settings door lands: Account for a signed-in person (the app's
      // own doors move to /settings/account), Local models for a guest (host.tsx).
      window.history.replaceState(null, '', signedIn ? '/settings/account' : '/settings/local-models');
      render(
        gui(
          <>
            <DesktopSettings isAuthenticated={signedIn} onBack={vi.fn()} onSignIn={vi.fn()} />
            <LocalAiManager />
          </>,
        ),
      );
      if (signedIn) fireEvent.click(entry('Local models'));
      expect(screen.queryByTestId('local-ai-manager-modal')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Manage local models' }));
      expect(await screen.findByTestId('local-ai-manager-modal')).toBeTruthy();
    },
  );

  it('answers the window keys @hanzo/app leaves to it: ⌘N and ⌘⇧M', () => {
    const press = (key: string, more: Partial<KeyboardEvent> = {}) =>
      windowKey({
        key,
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        repeat: false,
        isComposing: false,
        defaultPrevented: false,
        ...more,
      });
    expect(press('n', { metaKey: true })).toBe('new-chat');
    expect(press('N', { ctrlKey: true })).toBe('new-chat');
    expect(press('M', { metaKey: true, shiftKey: true })).toBe('voice');
    expect(press('m', { ctrlKey: true, shiftKey: true })).toBe('voice');
    // ⌘⇧O, ⌘B and ⌘, are @hanzo/app's own (keys.js); the window does not answer them twice.
    expect(press('o', { metaKey: true, shiftKey: true })).toBeNull();
    expect(press('b', { metaKey: true })).toBeNull();
    expect(press('n')).toBeNull();
    expect(press('n', { metaKey: true, altKey: true })).toBeNull();
    expect(press('n', { metaKey: true, repeat: true })).toBeNull();
    expect(press('n', { metaKey: true, isComposing: true })).toBeNull();
    expect(press('n', { metaKey: true, defaultPrevented: true })).toBeNull();
  });

  it('the palette’s New chat row shows the app’s own keys, and every command row splits into keycaps', () => {
    // The palette draws a command's keys with chip(), which splits the row's pc
    // spelling on '+'. The desktop's keys are its own (DESKTOP_KEYS), not rows of KEYS.
    expect(chip('chat.new')).toEqual(['Mod', 'Shift', 'O']);
    for (const k of KEYS.filter((k) => k.command)) {
      expect(k.pc, k.command).not.toMatch(/ \/ /);
      for (const cap of chip(k.command!)!) expect(cap.trim(), k.command).toBe(cap);
    }
    expect(KEYS.some((k) => k.mac === '⌘N' || k.mac === '⌘⇧M')).toBe(false);
  });

  it('runs the patched @hanzo/app: a signed-out window chats with the local engine', () => {
    const dist = resolve(__dirname, '../../../../node_modules/@hanzo/app/dist');
    const chat = readFileSync(resolve(dist, 'Chat.js'), 'utf8');
    const pane = readFileSync(resolve(dist, 'pane.js'), 'utf8');
    const setup = readFileSync(resolve(dist, 'Setup.js'), 'utf8');

    // The signed-out lane is the signed-in one (history, the picked model, no turn cap).
    expect(chat).toContain('HANZO DESKTOP ANSWERS ITS SIGNED-OUT READER ITSELF');
    expect(chat).toContain('const sent = anonymous ? wanted || ENSO : wanted;');
    expect(chat).toContain('"Select / Download Local Model"');
    // Files a signed-out reader attaches are read in the window, not refused.
    expect(pane).toContain('localText');
    expect(pane).not.toContain('Sign in to attach files');
    // Google Workspace is hidden in any window that passes `bar` by the app itself
    // (Setup.js reads Windowed, which App sets from bar); the desktop adds no second way.
    expect(setup).toContain("const workspace = opens('workspace') && !windowed;");
  });
});
