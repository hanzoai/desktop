import { KEYS, asked } from '@hanzo/app/help';
import { handle } from '@hanzo/app/keys';
import * as keymap from '@hanzo/dev-core/keymap';
import { chord } from '@hanzo/app/chord';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DESKTOP_GLOBAL_KEYS, windowKey } from '../desktop-shortcuts';

describe('Hanzo Desktop & @hanzo/app keybindings', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('lists every core Web + Desktop shortcut in KEYS and DESKTOP_GLOBAL_KEYS', () => {
    const macChords = KEYS.map((k) => k.mac);
    expect(macChords).toContain('⌘K');
    expect(macChords).toContain('⌘N / ⌘⇧O');
    expect(macChords).toContain('⌘B');
    expect(macChords).toContain('⌘⇧M');
    expect(macChords).toContain('⌘,');
    expect(macChords).toContain('⌘/');
    expect(macChords).toContain('⌘.');
    expect(macChords).toContain('⌘U');
    expect(macChords).toContain('⌃⌥R');
    expect(macChords).toContain('⌃⌥P');
    expect(macChords).toContain('⌘[');
    expect(macChords).toContain('⌘]');

    const globalChords = DESKTOP_GLOBAL_KEYS.map((k) => k.mac);
    // main.rs registers ⇧⌘I system-wide; ⇧⌘J (Spotlight) is not offered, as
    // Spotlight is deleted. Hanzo's Fn voice keys are listed as Settings draws them.
    expect(globalChords).toEqual(['⇧⌘I', 'Hold Fn', 'Double-tap Fn']);
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
    expect(setup).toContain('const workspace = false;');
  });
});
