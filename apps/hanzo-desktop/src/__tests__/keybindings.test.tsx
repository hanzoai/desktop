import { KEYS, asked } from '@hanzo/app/help';
import { summons } from '@hanzo/app/seek';
import { chord } from '@hanzo/app/chord';
import { fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createFnVoiceController,
  createMicLeaseArbitrator,
  DESKTOP_GLOBAL_KEYS,
  DesktopSettings,
} from '../desktop-shortcuts';

describe('Hanzo Desktop & @hanzo/app keybindings', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('lists every core Web + Desktop shortcut in KEYS and DESKTOP_GLOBAL_KEYS', () => {
    const macChords = KEYS.map((k) => k.mac);
    expect(macChords).toContain('⌘K');
    expect(macChords).toContain('⌘N / ⇧⌘O');
    expect(macChords).toContain('⌘B');
    expect(macChords).toContain('⇧⌘M');
    expect(macChords).toContain('⌘,');
    expect(macChords).toContain('⌘/');
    expect(macChords).toContain('⌘.');
    expect(macChords).toContain('⌘U');
    expect(macChords).toContain('⌃⌥R');
    expect(macChords).toContain('⌃⌥P');
    expect(macChords).toContain('⌘[');
    expect(macChords).toContain('⌘]');

    const globalChords = DESKTOP_GLOBAL_KEYS.map((k) => k.mac);
    expect(globalChords).toEqual(['⇧⌘I', '⇧⌘J', 'Hold Fn', 'Double-tap Fn']);
  });

  it('recognizes palette (⌘K), shortcuts dialog (⌘/), and conversation chords (⌃⌥R / ⌃⌥P)', () => {
    expect(
      summons({
        defaultPrevented: false,
        metaKey: true,
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
        repeat: false,
        isComposing: false,
        key: 'k',
        code: 'KeyK',
        target: null,
      } as unknown as Parameters<typeof summons>[0]),
    ).toBe(true);

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

  it('arbitrates Hold Fn push-to-talk and Double-tap Fn continuous voice', () => {
    let listening = false;
    const start = vi.fn(() => {
      listening = true;
    });
    const stop = vi.fn(() => {
      listening = false;
    });
    const toggle = vi.fn(() => {
      listening = !listening;
    });

    const fn = createFnVoiceController({
      isListening: () => listening,
      start,
      stop,
      toggle,
      holdMs: 250,
      doubleTapMs: 320,
    });

    // Single short tap does not trigger anything
    fn.onKeyDown({ key: 'Fn', code: 'Fn', repeat: false });
    vi.advanceTimersByTime(80);
    fn.onKeyUp({ key: 'Fn', code: 'Fn' });
    expect(start).not.toHaveBeenCalled();
    expect(toggle).not.toHaveBeenCalled();

    // Second tap within 320ms toggles hands-free continuous voice
    vi.advanceTimersByTime(100);
    fn.onKeyDown({ key: 'Fn', code: 'Fn', repeat: false });
    vi.advanceTimersByTime(60);
    fn.onKeyUp({ key: 'Fn', code: 'Fn' });
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(listening).toBe(true);

    // Reset to idle and test Hold Fn (>= 250ms) push-to-talk
    listening = false;
    vi.advanceTimersByTime(500);
    fn.onKeyDown({ key: 'Fn', code: 'Fn', repeat: false });
    vi.advanceTimersByTime(260);
    expect(start).toHaveBeenCalledTimes(1);
    expect(listening).toBe(true);

    fn.onKeyUp({ key: 'Fn', code: 'Fn' });
    expect(stop).toHaveBeenCalledTimes(1);
    expect(listening).toBe(false);

    fn.dispose();
  });

  it('renders DesktopSettings with Keyboard Shortcuts and returns on Escape or ⌘[', () => {
    const onBack = vi.fn();
    render(
      <DesktopSettings
        isAuthenticated={false}
        onBack={onBack}
        onSignIn={vi.fn()}
      />,
    );

    expect(screen.getByTestId('desktop-settings-page')).toBeTruthy();
    expect(screen.getByText('Keyboard Shortcuts')).toBeTruthy();
    expect(screen.getByText('Global Spotlight (system-wide)')).toBeTruthy();

    // Toggle theme to light and back to dark
    fireEvent.click(screen.getByTestId('desktop-theme-light'));
    expect(document.documentElement.classList.contains('light')).toBe(true);
    fireEvent.click(screen.getByTestId('desktop-theme-dark'));
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    // Escape triggers onBack
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onBack).toHaveBeenCalledTimes(1);

    // ⌘[ also triggers onBack
    fireEvent.keyDown(window, { key: '[', metaKey: true });
    expect(onBack).toHaveBeenCalledTimes(2);
  });

  it('verifies patched @hanzo/app wires ⌘N, ⇧⌘O, ⌘B, ⇧⌘M, ⌘, and guest ⌘/ shortcuts', () => {
    const appPath = resolve(__dirname, '../../../../node_modules/@hanzo/app/dist/App.js');
    const mePath = resolve(__dirname, '../../../../node_modules/@hanzo/app/dist/Me.js');
    const appJs = readFileSync(appPath, 'utf8');
    const meJs = readFileSync(mePath, 'utf8');

    expect(appJs).toContain("(bar && !e.shiftKey && lower === 'n')");
    expect(appJs).toContain("(e.shiftKey && lower === 'o')");
    expect(appJs).toContain("lower === 'b'");
    expect(appJs).toContain("lower === 'm'");
    expect(meJs).toContain('if (!host.person)\n        return _jsx(Shortcuts,');
  });

  it('arbitrates cross-window microphone lease so concurrent Hanzo apps never fight over the mic', () => {
    const preemptA = vi.fn();
    const preemptB = vi.fn();

    const appA = createMicLeaseArbitrator({
      instanceId: 'hanzo-app-a',
      onPreempted: preemptA,
      channelName: 'hanzo:voice:test-lease',
    });
    const appB = createMicLeaseArbitrator({
      instanceId: 'hanzo-team-b',
      onPreempted: preemptB,
      channelName: 'hanzo:voice:test-lease',
    });

    appA.claim();
    expect(appA.isHolding()).toBe(true);

    // Simulate appB claiming the microphone — appA must release immediately
    appA.handleIncoming({ type: 'claim', owner: 'hanzo-team-b' });
    expect(preemptA).toHaveBeenCalledTimes(1);
    expect(appA.isHolding()).toBe(false);
    expect(preemptB).not.toHaveBeenCalled();

    appA.dispose();
    appB.dispose();
  });
});
