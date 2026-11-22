import { KEYS } from '@hanzo/app/help';
import { DEV_MODE_NOTE, useDevMode } from '@hanzo/build/dev-mode';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useEffect, useState } from 'react';

import { ProvidersListSection } from './LibraryPane';
import { openLocalAiManager } from './local-ai';

export interface FnVoiceHooks {
  isListening: () => boolean;
  start: () => void;
  stop: () => void;
  toggle: () => void;
  holdMs?: number;
  doubleTapMs?: number;
}

export interface MicLeaseOptions {
  instanceId: string;
  onPreempted: () => void;
  channelName?: string;
}

/**
 * Arbitrates microphone ownership across multiple open Hanzo Desktop / Web windows
 * via BroadcastChannel + storage events so concurrent apps never fight over the mic.
 * When one window claims the mic, any other window currently holding it receives
 * `onPreempted()` and releases its recorder immediately.
 */
export function createMicLeaseArbitrator(options: MicLeaseOptions) {
  const channelName = options.channelName ?? 'hanzo:voice:lease';
  let holding = false;
  const bc =
    typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(channelName) : null;

  const handleIncoming = (msg: unknown) => {
    if (!msg || typeof msg !== 'object') return;
    const data = msg as { type?: string; owner?: string };
    if (data.type === 'claim' && data.owner && data.owner !== options.instanceId && holding) {
      holding = false;
      options.onPreempted();
    }
  };

  if (bc) {
    bc.onmessage = (ev) => handleIncoming(ev.data);
  }

  const onStorage = (ev: StorageEvent) => {
    if (ev.key !== channelName || !ev.newValue) return;
    try {
      handleIncoming(JSON.parse(ev.newValue));
    } catch {}
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage);
  }

  const claim = () => {
    holding = true;
    const payload = { type: 'claim', owner: options.instanceId, at: Date.now() };
    bc?.postMessage(payload);
    try {
      window.localStorage.setItem(channelName, JSON.stringify(payload));
    } catch {}
  };

  const release = () => {
    holding = false;
    const payload = { type: 'release', owner: options.instanceId, at: Date.now() };
    bc?.postMessage(payload);
  };

  const isHolding = () => holding;

  const dispose = () => {
    holding = false;
    bc?.close();
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', onStorage);
    }
  };

  return { claim, release, isHolding, handleIncoming, dispose };
}

/**
 * Arbitrates `Fn` key gestures for desktop voice input:
 * - Hold `Fn` (>= holdMs, default 250ms): starts push-to-talk on hold, stops on keyup.
 * - Double-tap `Fn` (two taps within doubleTapMs, default 320ms): toggles hands-free listening.
 */
export function createFnVoiceController(hooks: FnVoiceHooks) {
  const holdMs = hooks.holdMs ?? 250;
  const doubleTapMs = hooks.doubleTapMs ?? 320;
  let downAt = 0;
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  let heldActive = false;
  let lastTapAt = 0;

  const isFnKey = (e: Pick<KeyboardEvent, 'key' | 'code'>) =>
    e.key === 'Fn' || e.code === 'Fn';

  const onKeyDown = (e: Pick<KeyboardEvent, 'key' | 'code' | 'repeat'>) => {
    if (!isFnKey(e) || e.repeat || downAt > 0) return;
    downAt = Date.now();
    heldActive = false;
    holdTimer = setTimeout(() => {
      holdTimer = null;
      if (downAt > 0 && !hooks.isListening()) {
        heldActive = true;
        hooks.start();
      }
    }, holdMs);
  };

  const onKeyUp = (e: Pick<KeyboardEvent, 'key' | 'code'>) => {
    if (!isFnKey(e) || downAt === 0) return;
    const now = Date.now();
    const elapsed = now - downAt;
    downAt = 0;
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    if (heldActive) {
      heldActive = false;
      if (hooks.isListening()) hooks.stop();
      return;
    }
    if (elapsed < holdMs) {
      if (now - lastTapAt <= doubleTapMs) {
        lastTapAt = 0;
        hooks.toggle();
      } else {
        lastTapAt = now;
      }
    }
  };

  const dispose = () => {
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    downAt = 0;
    heldActive = false;
  };

  return { onKeyDown, onKeyUp, dispose };
}

export const DESKTOP_GLOBAL_KEYS = [
  { does: 'Global New Chat (system-wide)', mac: '⇧⌘I', pc: 'Ctrl+Shift+I' },
  { does: 'Global Spotlight (system-wide)', mac: '⇧⌘J', pc: 'Ctrl+Shift+J' },
  { does: 'Push-to-talk voice', mac: 'Hold Fn', pc: 'Hold Fn' },
  { does: 'Hands-free voice toggle', mac: 'Double-tap Fn', pc: 'Double-tap Fn' },
] as const;

/** What a key press asks of the window itself (`windowKey`). */
export type WindowAct = 'new-chat' | 'voice';

/**
 * The window's own keys, past the ones @hanzo/app answers (its keys.js: ⌘K,
 * ⌘⇧O, ⌘B, ⌘, and the rest): ⌘N opens a new chat, as File ▸ New does in a
 * desktop app, and ⌘⇧M turns the composer's microphone on and off. Ctrl on
 * Windows and Linux. A press something already answered, a repeat, or one
 * still composing a character is not a command. Both keys are in @hanzo/app's
 * KEYS (patches/@hanzo__app@0.3.107.patch), so its shortcut list names them.
 */
export function windowKey(
  e: Pick<
    KeyboardEvent,
    'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'repeat' | 'isComposing' | 'defaultPrevented'
  >,
): WindowAct | null {
  if (e.defaultPrevented || e.isComposing || e.repeat || e.altKey) return null;
  if (!(e.metaKey || e.ctrlKey)) return null;
  const key = (e.key ?? '').toLowerCase();
  if (!e.shiftKey && key === 'n') return 'new-chat';
  if (e.shiftKey && key === 'm') return 'voice';
  return null;
}

export function DesktopSettings({
  isAuthenticated,
  siteUrl = 'https://hanzo.ai',
  localEngineUrl = 'http://localhost:36900',
  barInset = 0,
  onSignIn,
  onBack,
}: {
  isAuthenticated: boolean;
  siteUrl?: string;
  localEngineUrl?: string;
  barInset?: number;
  onSignIn: () => void;
  onBack: () => void;
}) {
  const apple = /Mac|iPhone|iPad/.test(navigator.userAgent);
  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    document.documentElement.classList.contains('light') ? 'light' : 'dark',
  );
  const [hanzodUp, setHanzodUp] = useState<boolean | null>(null);
  const [engineUp, setEngineUp] = useState<boolean | null>(null);
  const [devMode, setDevMode] = useDevMode();
  const [section, setSection] = useState<
    'general' | 'providers' | 'engine' | 'node' | 'extension' | 'account'
  >('general');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || (e.metaKey && e.key === '[')) {
        e.preventDefault();
        onBack();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1200);

    fetch('http://127.0.0.1:9630/v1/chain/hanzo/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
      signal: ctrl.signal,
    })
      .then((r) => {
        if (!cancelled) setHanzodUp(r.ok);
      })
      .catch(() => {
        if (!cancelled) setHanzodUp(false);
      });

    fetch(`${localEngineUrl}/health`, { signal: ctrl.signal })
      .then((r) => {
        if (!cancelled) setEngineUp(r.ok);
      })
      .catch(() => {
        if (!cancelled) setEngineUp(false);
      });

    return () => {
      cancelled = true;
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [localEngineUrl]);

  const applyTheme = (next: 'dark' | 'light') => {
    setTheme(next);
    try {
      window.localStorage.setItem('hanzo.appearance', JSON.stringify({ theme: next }));
    } catch {}
    document.documentElement.classList.remove('dark', 'light', 't_dark', 't_light');
    document.documentElement.classList.add(next, `t_${next}`);
  };

  return (
    <div
      data-testid="desktop-settings-page"
      style={{
        height: '100vh',
        width: '100vw',
        display: 'flex',
        flexDirection: 'column',
        background: theme === 'light' ? '#fafafa' : '#09090b',
        color: theme === 'light' ? '#09090b' : '#f4f4f5',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div
        data-tauri-drag-region
        style={{
          height: 44,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingLeft: barInset + 12,
          paddingRight: 16,
          borderBottom: `1px solid ${theme === 'light' ? '#e4e4e7' : '#27272a'}`,
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          data-testid="desktop-settings-back"
          onClick={onBack}
          style={{
            background: 'transparent',
            border: `1px solid ${theme === 'light' ? '#d4d4d8' : '#3f3f46'}`,
            color: 'inherit',
            borderRadius: 8,
            padding: '4px 12px',
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          ← Back to Hanzo
        </button>
        <div style={{ fontSize: 13, fontWeight: 600, opacity: 0.8 }}>Hanzo Desktop Settings</div>
        <div style={{ width: 96 }} />
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
        <nav
          aria-label="Settings sections"
          style={{
            width: 210,
            flexShrink: 0,
            padding: '16px 10px',
            borderRight: `1px solid ${theme === 'light' ? '#e4e4e7' : 'rgba(255,255,255,0.06)'}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          {(
            [
              ['general', 'General'],
              ['providers', 'Providers'],
              ['engine', 'Inference Engine'],
              ['node', 'Blockchain Node'],
              ['extension', 'Browser Extension'],
              ['account', 'Account & KMS'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSection(id)}
              style={{
                textAlign: 'left',
                height: 34,
                padding: '0 12px',
                borderRadius: 8,
                border: 'none',
                background:
                  section === id
                    ? theme === 'light'
                      ? '#e4e4e7'
                      : '#161616'
                    : 'transparent',
                color: 'inherit',
                opacity: section === id ? 1 : 0.68,
                fontSize: 13,
                fontWeight: section === id ? 500 : 400,
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
        </nav>

        <div style={{ flex: 1, overflowY: 'auto', padding: '28px 28px 48px' }}>
          <div style={{ maxWidth: 680, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
            {section === 'general' ? (
              <>
                <section
                  data-testid="desktop-dev-mode"
                  style={{
                    padding: 20,
                    borderRadius: 14,
                    border: `1px solid ${theme === 'light' ? '#e4e4e7' : '#27272a'}`,
                    background: theme === 'light' ? '#ffffff' : '#111114',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 16,
                  }}
                >
                  <div>
                    <h2 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 600 }}>Developer mode</h2>
                    <p style={{ margin: 0, fontSize: 13, opacity: 0.7 }}>{DEV_MODE_NOTE}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={devMode}
                    aria-label="Developer mode"
                    data-testid="desktop-dev-mode-switch"
                    onClick={() => setDevMode(!devMode)}
                    style={{
                      flexShrink: 0,
                      width: 44,
                      height: 26,
                      borderRadius: 999,
                      border: 'none',
                      padding: 3,
                      display: 'flex',
                      justifyContent: devMode ? 'flex-end' : 'flex-start',
                      background: devMode ? (theme === 'light' ? '#18181b' : '#fafafa') : theme === 'light' ? '#d4d4d8' : '#3f3f46',
                      cursor: 'pointer',
                    }}
                  >
                    <span
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 999,
                        background: devMode ? (theme === 'light' ? '#fafafa' : '#09090b') : theme === 'light' ? '#ffffff' : '#a1a1aa',
                      }}
                    />
                  </button>
                </section>

                <section
                  style={{
                    padding: 20,
                    borderRadius: 14,
                    border: `1px solid ${theme === 'light' ? '#e4e4e7' : '#27272a'}`,
                    background: theme === 'light' ? '#ffffff' : '#111114',
                  }}
                >
                  <h2 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 600 }}>Appearance</h2>
                  <p style={{ margin: '0 0 14px', fontSize: 13, opacity: 0.7 }}>
                    Choose the workspace appearance for Hanzo Desktop.
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {(['dark', 'light'] as const).map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        data-testid={`desktop-theme-${opt}`}
                        onClick={() => applyTheme(opt)}
                        style={{
                          padding: '7px 16px',
                          borderRadius: 999,
                          border: `1px solid ${theme === opt ? (theme === 'light' ? '#18181b' : '#fafafa') : '#3f3f46'}`,
                          background: theme === opt ? (theme === 'light' ? '#18181b' : '#fafafa') : 'transparent',
                          color: theme === opt ? (theme === 'light' ? '#fafafa' : '#09090b') : 'inherit',
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: 'pointer',
                          textTransform: 'capitalize',
                        }}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </section>

                <section
                  style={{
                    padding: 20,
                    borderRadius: 14,
                    border: `1px solid ${theme === 'light' ? '#e4e4e7' : '#27272a'}`,
                    background: theme === 'light' ? '#ffffff' : '#111114',
                  }}
                >
                  <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600 }}>Keyboard Shortcuts</h2>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[...KEYS.map((k) => ({ does: String(k.does), mac: k.mac, pc: k.pc })), ...DESKTOP_GLOBAL_KEYS].map(
                      (item) => (
                        <div
                          key={item.does}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '6px 0',
                            borderBottom: `1px solid ${theme === 'light' ? '#f4f4f5' : '#18181b'}`,
                            fontSize: 13,
                          }}
                        >
                          <span>{item.does}</span>
                          <kbd
                            style={{
                              padding: '2px 8px',
                              borderRadius: 6,
                              border: `1px solid ${theme === 'light' ? '#d4d4d8' : '#3f3f46'}`,
                              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                              fontSize: 12,
                            }}
                          >
                            {apple ? item.mac : item.pc}
                          </kbd>
                        </div>
                      ),
                    )}
                  </div>
                </section>
              </>
            ) : null}

            {section === 'providers' ? (
              <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 600 }}>AI Providers</h2>
                  <p style={{ margin: 0, fontSize: 13, opacity: 0.7 }}>
                    Connect frontier and local providers directly on this machine or route through Hanzo Cloud.
                  </p>
                </div>
                <ProvidersListSection />
              </section>
            ) : null}

            {section === 'engine' ? (
              <section
                style={{
                  padding: 20,
                  borderRadius: 14,
                  border: `1px solid ${theme === 'light' ? '#e4e4e7' : '#27272a'}`,
                  background: theme === 'light' ? '#ffffff' : '#111114',
                }}
              >
                <h2 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 600 }}>Native Inference Engine</h2>
                <p style={{ margin: '0 0 14px', fontSize: 13, opacity: 0.7 }}>
                  Manage local Zen 6 / Qwen3+ weights, GPU acceleration, and the embedded Hanzo Engine (127.0.0.1:36900) alongside Ollama (127.0.0.1:11434).
                </p>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14, fontSize: 12 }}>
                  <span style={{ padding: '4px 10px', borderRadius: 999, border: '1px solid #3f3f46' }}>
                    Hanzo Engine (127.0.0.1:36900):{' '}
                    <strong>{engineUp === null ? 'checking…' : engineUp ? 'online' : 'not running'}</strong>
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => openLocalAiManager('models')}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 8,
                      border: '1px solid #3f3f46',
                      background: 'transparent',
                      color: 'inherit',
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    Manage Local Models
                  </button>
                  <button
                    type="button"
                    onClick={() => openLocalAiManager('engine')}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 8,
                      border: '1px solid #3f3f46',
                      background: 'transparent',
                      color: 'inherit',
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    Engine Diagnostics
                  </button>
                </div>
              </section>
            ) : null}

            {section === 'node' ? (
              <section
                style={{
                  padding: 20,
                  borderRadius: 14,
                  border: `1px solid ${theme === 'light' ? '#e4e4e7' : '#27272a'}`,
                  background: theme === 'light' ? '#ffffff' : '#111114',
                }}
              >
                <h2 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 600 }}>Blockchain Node (hanzod)</h2>
                <p style={{ margin: '0 0 14px', fontSize: 13, opacity: 0.7 }}>
                  Local Hanzo validator & RPC daemon for verifiable compute receipts, staking, and peer discovery.
                </p>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14, fontSize: 12 }}>
                  <span style={{ padding: '4px 10px', borderRadius: 999, border: '1px solid #3f3f46' }}>
                    hanzod RPC (127.0.0.1:9630):{' '}
                    <strong>{hanzodUp === null ? 'checking…' : hanzodUp ? 'online' : 'not running'}</strong>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => openLocalAiManager('node')}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: '1px solid #3f3f46',
                    background: 'transparent',
                    color: 'inherit',
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  Open Node Manager
                </button>
              </section>
            ) : null}

            {section === 'extension' ? (
              <section
                style={{
                  padding: 20,
                  borderRadius: 14,
                  border: `1px solid ${theme === 'light' ? '#e4e4e7' : '#27272a'}`,
                  background: theme === 'light' ? '#ffffff' : '#111114',
                }}
              >
                <h2 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 600 }}>Browser Extension</h2>
                <p style={{ margin: '0 0 14px', fontSize: 13, opacity: 0.7 }}>
                  Connect Chrome, Firefox, or Safari via ZAP & CDP so Hanzo can inspect tabs, run Zen 6 in-browser, and register this browser as a linked machine in hanzo.app.
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => void openUrl(`${siteUrl}/download`)}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 8,
                      border: '1px solid #3f3f46',
                      background: 'transparent',
                      color: 'inherit',
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    Install Browser Extension ↗
                  </button>
                </div>
              </section>
            ) : null}

            {section === 'account' ? (
              <section
                style={{
                  padding: 20,
                  borderRadius: 14,
                  border: `1px solid ${theme === 'light' ? '#e4e4e7' : '#27272a'}`,
                  background: theme === 'light' ? '#ffffff' : '#111114',
                }}
              >
                <h2 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 600 }}>Account & Cloud KMS</h2>
                <p style={{ margin: '0 0 14px', fontSize: 13, opacity: 0.7 }}>
                  {isAuthenticated
                    ? 'Signed in via Hanzo IAM. Secrets and provider keys sync through Hanzo Cloud KMS (never macOS Keychain).'
                    : 'Running locally without login. Sign in via Hanzo IAM to sync threads, devices, and Cloud KMS secrets.'}
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {isAuthenticated ? (
                    <button
                      type="button"
                      onClick={() => void openUrl(`${siteUrl}/settings`)}
                      style={{
                        padding: '8px 14px',
                        borderRadius: 8,
                        border: '1px solid #3f3f46',
                        background: 'transparent',
                        color: 'inherit',
                        fontSize: 13,
                        fontWeight: 500,
                        cursor: 'pointer',
                      }}
                    >
                      Open Cloud Settings ↗
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={onSignIn}
                      style={{
                        padding: '8px 16px',
                        borderRadius: 999,
                        border: 'none',
                        background: theme === 'light' ? '#18181b' : '#fafafa',
                        color: theme === 'light' ? '#fafafa' : '#09090b',
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Sign in to Hanzo Cloud
                    </button>
                  )}
                </div>
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
