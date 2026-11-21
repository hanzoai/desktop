import { useCallback, useEffect, useState } from 'react';

import { safeInvoke } from './utils/tauri-check';

export const ONBOARDING_PERMISSIONS_STORAGE_KEY = 'hanzo:desktop:onboarding-permissions:v1';
const LOCAL_APP_PERMISSIONS_STORAGE_KEY = 'hanzo:desktop:local-app-permissions:v1';
const DICTATION_SHORTCUTS_STORAGE_KEY = 'hanzo:desktop:dictation-shortcuts:v1';

const PROGRESS_SEGMENTS = 3;

type PermissionPane = 'accessibility' | 'screen-recording' | 'full-disk-access' | 'microphone';
type LocalAppAccessLevel = 'read-and-interact' | 'read-only' | 'off';
type LocalAppId = 'mail' | 'messages' | 'notes' | 'whatsapp';

interface PermissionSnapshot {
  accessibility: boolean;
  screenRecording: boolean;
  fullDiskAccess: boolean;
  microphone: boolean;
}

const LOCAL_APPS: ReadonlyArray<{ id: LocalAppId; name: string; label: string }> = [
  { id: 'mail', name: 'Mail.app', label: 'M' },
  { id: 'messages', name: 'Messages.app', label: 'Ms' },
  { id: 'notes', name: 'Notes.app', label: 'N' },
  { id: 'whatsapp', name: 'WhatsApp.app', label: 'W' },
];

export const COMMAND_SHORTCUT_PRESETS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'Alt+Space', label: '⌥ Space (Option + Space)' },
  { value: 'Super+Shift+J', label: '⌘ ⇧ J' },
  { value: 'Super+Shift+Space', label: '⌘ ⇧ Space' },
  { value: 'Alt+Shift+Space', label: '⌥ ⇧ Space' },
];

function readLocalApps(): Record<LocalAppId, LocalAppAccessLevel> {
  const defaults: Record<LocalAppId, LocalAppAccessLevel> = {
    mail: 'read-and-interact',
    messages: 'read-and-interact',
    notes: 'read-and-interact',
    whatsapp: 'read-only',
  };
  try {
    const raw = window.localStorage.getItem(LOCAL_APP_PERMISSIONS_STORAGE_KEY);
    if (!raw) return defaults;
    return { ...defaults, ...(JSON.parse(raw) as Partial<Record<LocalAppId, LocalAppAccessLevel>>) };
  } catch {
    return defaults;
  }
}

function readDictationPrefs(): { pushToTalk: string; handsFree: string } {
  const defaults = { pushToTalk: 'fn', handsFree: 'none' };
  try {
    const raw = window.localStorage.getItem(DICTATION_SHORTCUTS_STORAGE_KEY);
    if (!raw) return defaults;
    return { ...defaults, ...(JSON.parse(raw) as { pushToTalk?: string; handsFree?: string }) };
  } catch {
    return defaults;
  }
}

export function isPermissionsOnboardingComplete(): boolean {
  try {
    return window.localStorage.getItem(ONBOARDING_PERMISSIONS_STORAGE_KEY) === '1';
  } catch {
    return true;
  }
}

export function markPermissionsOnboardingComplete(): void {
  try {
    window.localStorage.setItem(ONBOARDING_PERMISSIONS_STORAGE_KEY, '1');
  } catch {
    // Ignore private storage errors.
  }
}

export function useDesktopPermissionSnapshot(enabled = true) {
  const [status, setStatus] = useState<PermissionSnapshot>({
    accessibility: false,
    screenRecording: false,
    fullDiskAccess: false,
    microphone: false,
  });

  const refresh = useCallback(async () => {
    const [accessibility, screenRecording, fullDiskAccess, microphone] = await Promise.all([
      safeInvoke<boolean>('desktop_check_system_permission', { pane: 'accessibility' }),
      safeInvoke<boolean>('desktop_check_system_permission', { pane: 'screen-recording' }),
      safeInvoke<boolean>('desktop_check_system_permission', { pane: 'full-disk-access' }),
      safeInvoke<boolean>('desktop_check_system_permission', { pane: 'microphone' }),
    ]);
    setStatus({
      accessibility: Boolean(accessibility),
      screenRecording: Boolean(screenRecording),
      fullDiskAccess: Boolean(fullDiskAccess),
      microphone: Boolean(microphone),
    });
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 1500);
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [enabled, refresh]);

  const openSettings = useCallback(async (pane: PermissionPane) => {
    await safeInvoke<boolean>('desktop_open_system_settings', { pane });
  }, []);

  return { status, refresh, openSettings };
}

/**
 * 3-segment progressive bar matching hanzo.ai/beta (`components/beta/portal.tsx`):
 * divides any total step count smoothly across 3 monochrome bars.
 */
function BetaProgress({ done, total }: { done: number; total: number }) {
  const pct = Math.max(0, Math.min(1, total > 0 ? done / total : 0));
  const reached = pct * PROGRESS_SEGMENTS;
  return (
    <div
      role="progressbar"
      aria-label="Setup progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct * 100)}
      style={{
        display: 'flex',
        gap: 6,
        width: '100%',
      }}
    >
      {Array.from({ length: PROGRESS_SEGMENTS }, (_, n) => (
        <div
          key={n}
          aria-hidden="true"
          style={{
            flex: 1,
            height: 4,
            borderRadius: 9999,
            background: 'rgba(255, 255, 255, 0.12)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              borderRadius: 9999,
              background: '#fafafa',
              width: `${Math.max(0, Math.min(1, reached - n)) * 100}%`,
              transition: 'width 240ms ease',
            }}
          />
        </div>
      ))}
    </div>
  );
}

export function OnboardingPermissions({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const stepCount = 4;
  const { status, openSettings } = useDesktopPermissionSnapshot(true);
  const [localApps, setLocalApps] = useState<Record<LocalAppId, LocalAppAccessLevel>>(readLocalApps);
  const [dictation, setDictation] = useState(readDictationPrefs);
  const [commandShortcut, setCommandShortcut] = useState('Alt+Space');
  const [shortcutFeedback, setShortcutFeedback] = useState<string | null>(null);
  const [micBusy, setMicBusy] = useState(false);

  useEffect(() => {
    void safeInvoke<string>('desktop_get_spotlight_shortcut').then((saved) => {
      if (saved) setCommandShortcut(saved);
    });
  }, []);

  const next = () => {
    if (step + 1 >= stepCount) {
      markPermissionsOnboardingComplete();
      onDone();
    } else {
      setStep((s) => s + 1);
    }
  };

  const updateAppLevel = (id: LocalAppId, level: LocalAppAccessLevel) => {
    setLocalApps((prev) => {
      const updated = { ...prev, [id]: level };
      try {
        window.localStorage.setItem(LOCAL_APP_PERMISSIONS_STORAGE_KEY, JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const updateDictation = (patch: Partial<{ pushToTalk: string; handsFree: string }>) => {
    setDictation((prev) => {
      const updated = { ...prev, ...patch };
      try {
        window.localStorage.setItem(DICTATION_SHORTCUTS_STORAGE_KEY, JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const requestMic = async () => {
    setMicBusy(true);
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        for (const track of stream.getTracks()) track.stop();
        setMicBusy(false);
        return;
      }
    } catch {
      // Fall back to macOS Microphone System Settings.
    }
    setMicBusy(false);
    await openSettings('microphone');
  };

  const applyCommandShortcut = async (nextShortcut: string) => {
    setCommandShortcut(nextShortcut);
    setShortcutFeedback(null);
    const res = await safeInvoke<string>('desktop_set_spotlight_shortcut', { shortcut: nextShortcut });
    if (res) {
      setShortcutFeedback(`Bound ${res} globally`);
    } else {
      setShortcutFeedback('Saved (if another app holds this key, try another preset)');
    }
  };

  const computerReady = status.accessibility && status.screenRecording;
  const stepReady =
    step === 0
      ? computerReady
      : step === 1
        ? status.fullDiskAccess
        : step === 2
          ? status.microphone
          : true;
  const progressDone = step + (stepReady ? 1 : 0.5);

  return (
    <div
      style={{
        position: 'relative',
        height: '100vh',
        width: '100vw',
        background: '#09090b',
        color: '#fafafa',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px 32px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif',
      }}
    >
      <div data-tauri-drag-region="" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 48 }} />

      {/* Top-right < | > stepper */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          right: 20,
          display: 'inline-flex',
          alignItems: 'center',
          borderRadius: 999,
          border: '1px solid rgba(255,255,255,0.12)',
          background: '#111114',
          overflow: 'hidden',
        }}
      >
        <button
          type="button"
          aria-label="Previous step"
          disabled={step === 0}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          style={{
            width: 32,
            height: 28,
            border: 'none',
            background: 'transparent',
            color: step === 0 ? 'rgba(255,255,255,0.22)' : '#fafafa',
            cursor: step === 0 ? 'default' : 'pointer',
            fontSize: 15,
          }}
        >
          ‹
        </button>
        <span style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.12)' }} />
        <button
          type="button"
          aria-label="Next step"
          disabled={step === stepCount - 1}
          onClick={() => setStep((s) => Math.min(stepCount - 1, s + 1))}
          style={{
            width: 32,
            height: 28,
            border: 'none',
            background: 'transparent',
            color: step === stepCount - 1 ? 'rgba(255,255,255,0.22)' : '#fafafa',
            cursor: step === stepCount - 1 ? 'default' : 'pointer',
            fontSize: 15,
          }}
        >
          ›
        </button>
      </div>

      <div style={{ width: '100%', maxWidth: 480, textAlign: 'center' }}>
        {/* 3-segment progressive bar (same pattern as hanzo.ai/beta) */}
        <div style={{ marginBottom: 32 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: 8,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 11.5,
              color: 'rgba(250, 250, 250, 0.5)',
            }}
          >
            <span>Hanzo Setup</span>
            <span>{Math.round((progressDone / stepCount) * 100)}%</span>
          </div>
          <BetaProgress done={progressDone} total={stepCount} />
        </div>

        {step === 0 ? (
          <>
            <h1 style={titleStyle}>Allow Hanzo to use your computer?</h1>
            <p style={subtitleStyle}>
              Ask Hanzo to complete a task, then step away. Hanzo has it ready when you&apos;re back.
            </p>
            <div style={cardStyle}>
              <div style={rowStyle}>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={rowTitleStyle}>Accessibility</div>
                </div>
                {status.accessibility ? (
                  <CheckBadge />
                ) : (
                  <AllowPill onClick={() => void openSettings('accessibility')} />
                )}
              </div>
              <div style={dividerStyle} />
              <div style={rowStyle}>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={rowTitleStyle}>Screen Recording</div>
                  <div style={rowDescStyle}>Allow Hanzo to take screenshots</div>
                </div>
                {status.screenRecording ? (
                  <CheckBadge />
                ) : (
                  <AllowPill onClick={() => void openSettings('screen-recording')} />
                )}
              </div>
            </div>
            <p style={captionStyle}>
              You can manage computer use permissions and blocked apps any time in Settings.
            </p>
            <div style={{ marginTop: 28 }}>
              {computerReady ? (
                <ContinuePill onClick={next} />
              ) : (
                <button type="button" onClick={next} style={skipButtonStyle}>
                  Skip
                </button>
              )}
            </div>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <h1 style={titleStyle}>Allow Hanzo to access your files and local apps?</h1>
            <p style={subtitleStyle}>
              You don&apos;t need to hunt through folders, notes and messages anymore. With your approval,
              Hanzo can find, read and edit your files and local apps.
            </p>
            {status.fullDiskAccess ? (
              <>
                <div style={pillStatusStyle}>
                  <span>Full Disk Access</span>
                  <span style={{ color: '#fafafa', fontWeight: 700 }}>✓</span>
                </div>
                <div style={{ textAlign: 'left', marginTop: 20 }}>
                  <div style={sectionLabelStyle}>Select permissions for these apps</div>
                  <div style={cardStyle}>
                    {LOCAL_APPS.map((app, i) => (
                      <div key={app.id}>
                        {i > 0 ? <div style={dividerStyle} /> : null}
                        <div style={rowStyle}>
                          <span
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: 6,
                              background: 'rgba(255, 255, 255, 0.08)',
                              border: '1px solid rgba(255, 255, 255, 0.12)',
                              color: '#fafafa',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 10.5,
                              fontWeight: 600,
                              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                            }}
                          >
                            {app.label}
                          </span>
                          <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{app.name}</span>
                          <select
                            aria-label={app.name}
                            value={localApps[app.id]}
                            onChange={(e) => updateAppLevel(app.id, e.target.value as LocalAppAccessLevel)}
                            style={selectStyle}
                          >
                            <option value="read-and-interact" style={optionStyle}>Read and interact</option>
                            <option value="read-only" style={optionStyle}>Read only</option>
                            <option value="off" style={optionStyle}>Off</option>
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ marginTop: 26 }}>
                  <ContinuePill onClick={next} />
                </div>
              </>
            ) : (
              <>
                <div style={cardStyle}>
                  <div style={rowStyle}>
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <div style={rowTitleStyle}>Full Disk Access</div>
                      <div style={rowDescStyle}>Allow Hanzo to access your files and local apps</div>
                    </div>
                    <AllowPill onClick={() => void openSettings('full-disk-access')} />
                  </div>
                </div>
                <p style={captionStyle}>
                  You can turn on or off Full Disk Access and add blocked folders any time in Settings.
                </p>
                <div style={{ marginTop: 28 }}>
                  <button type="button" onClick={next} style={skipButtonStyle}>
                    Skip
                  </button>
                </div>
              </>
            )}
          </>
        ) : null}

        {step === 2 ? (
          <>
            <h1 style={titleStyle}>Enable dictation</h1>
            <p style={subtitleStyle}>Turn speech to text using a seamless voice-first workflow.</p>
            {status.microphone ? (
              <div style={pillStatusStyle}>
                <span>Microphone</span>
                <span style={{ color: '#fafafa', fontWeight: 700 }}>✓</span>
              </div>
            ) : (
              <div style={cardStyle}>
                <div style={rowStyle}>
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={rowTitleStyle}>Microphone</div>
                    <div style={rowDescStyle}>Allow Hanzo to use your microphone for dictation</div>
                  </div>
                  <AllowPill disabled={micBusy} onClick={() => void requestMic()} />
                </div>
              </div>
            )}
            <div style={{ textAlign: 'left', marginTop: 20 }}>
              <div style={sectionLabelStyle}>Shortcuts</div>
              <div style={cardStyle}>
                <div style={rowStyle}>
                  <div style={{ flex: 1 }}>
                    <div style={rowTitleStyle}>Push to talk</div>
                    <div style={rowDescStyle}>Hold the key to dictate</div>
                  </div>
                  <select
                    aria-label="Push to talk"
                    value={dictation.pushToTalk}
                    onChange={(e) => updateDictation({ pushToTalk: e.target.value })}
                    style={selectStyle}
                  >
                    <option value="fn" style={optionStyle}>Fn</option>
                    <option value="option-space" style={optionStyle}>Option + Space</option>
                    <option value="none" style={optionStyle}>No shortcut</option>
                  </select>
                </div>
                <div style={dividerStyle} />
                <div style={rowStyle}>
                  <div style={{ flex: 1 }}>
                    <div style={rowTitleStyle}>Hands-free mode</div>
                    <div style={rowDescStyle}>Press the key to start and stop dictation without holding</div>
                  </div>
                  <select
                    aria-label="Hands-free mode"
                    value={dictation.handsFree}
                    onChange={(e) => updateDictation({ handsFree: e.target.value })}
                    style={selectStyle}
                  >
                    <option value="none" style={optionStyle}>No shortcut</option>
                    <option value="double-fn" style={optionStyle}>Double-tap Fn</option>
                    <option value="option-space" style={optionStyle}>Option + Space</option>
                  </select>
                </div>
              </div>
            </div>
            <div style={{ marginTop: 28 }}>
              <ContinuePill onClick={next} />
            </div>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <h1 style={titleStyle}>Bind Hanzo Command</h1>
            <p style={subtitleStyle}>
              Summon the floating Hanzo Command bar over any app to ask questions, launch apps, search files, or kick off Dev tasks.
            </p>
            <div style={cardStyle}>
              <div style={rowStyle}>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={rowTitleStyle}>Global shortcut</div>
                  <div style={rowDescStyle}>Works from any app (⌘⇧J is always available too)</div>
                </div>
                <select
                  aria-label="Hanzo Command shortcut"
                  value={commandShortcut}
                  onChange={(e) => void applyCommandShortcut(e.target.value)}
                  style={selectStyle}
                >
                  {COMMAND_SHORTCUT_PRESETS.map((preset) => (
                    <option key={preset.value} value={preset.value} style={optionStyle}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </div>
              <div style={dividerStyle} />
              <div style={rowStyle}>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={rowTitleStyle}>Preview floating HUD</div>
                  <div style={rowDescStyle}>
                    {shortcutFeedback ?? 'Test Hanzo Command right now'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void safeInvoke('show_spotlight_window_app')}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 999,
                    border: '1px solid rgba(255,255,255,0.16)',
                    background: 'rgba(255,255,255,0.08)',
                    color: '#fafafa',
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  Launch
                </button>
              </div>
            </div>
            <div style={{ marginTop: 28 }}>
              <ContinuePill label="Start using Hanzo" onClick={next} />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function AllowPill({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        height: 28,
        padding: '0 14px',
        borderRadius: 999,
        border: 'none',
        background: '#fafafa',
        color: '#09090b',
        fontSize: 12.5,
        fontWeight: 600,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.45 : 1,
      }}
    >
      Allow
    </button>
  );
}

function CheckBadge() {
  return (
    <span
      role="status"
      aria-label="Allowed"
      style={{
        width: 22,
        height: 22,
        borderRadius: 999,
        background: '#fafafa',
        color: '#09090b',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 12.5,
        fontWeight: 800,
      }}
    >
      ✓
    </span>
  );
}

function ContinuePill({ onClick, label = 'Continue' }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: 40,
        minWidth: 180,
        padding: '0 28px',
        borderRadius: 999,
        border: 'none',
        background: '#fafafa',
        color: '#09090b',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 25,
  fontWeight: 600,
  letterSpacing: -0.4,
  color: '#fafafa',
};

const subtitleStyle: React.CSSProperties = {
  margin: '10px auto 0',
  maxWidth: 420,
  fontSize: 13.5,
  lineHeight: 1.5,
  color: 'rgba(250, 250, 250, 0.6)',
};

const cardStyle: React.CSSProperties = {
  marginTop: 22,
  borderRadius: 16,
  border: '1px solid rgba(255, 255, 255, 0.1)',
  background: '#111114',
  overflow: 'hidden',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '13px 16px',
};

const rowTitleStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: '#fafafa',
};

const rowDescStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'rgba(250, 250, 250, 0.52)',
  marginTop: 2,
};

const dividerStyle: React.CSSProperties = {
  height: 1,
  margin: '0 16px',
  background: 'rgba(255, 255, 255, 0.08)',
};

const captionStyle: React.CSSProperties = {
  margin: '12px 4px 0',
  textAlign: 'left',
  fontSize: 11.5,
  lineHeight: 1.5,
  color: 'rgba(250, 250, 250, 0.45)',
};

const sectionLabelStyle: React.CSSProperties = {
  marginBottom: 8,
  paddingLeft: 4,
  fontSize: 12,
  fontWeight: 500,
  color: 'rgba(250, 250, 250, 0.55)',
};

const pillStatusStyle: React.CSSProperties = {
  marginTop: 18,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 14px',
  borderRadius: 999,
  border: '1px solid rgba(255, 255, 255, 0.12)',
  background: '#111114',
  fontSize: 12.5,
  fontWeight: 500,
  color: '#fafafa',
};

const selectStyle: React.CSSProperties = {
  background: 'transparent',
  color: '#fafafa',
  border: 'none',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  outline: 'none',
};

const optionStyle: React.CSSProperties = {
  background: '#111114',
  color: '#fafafa',
};

const skipButtonStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'rgba(250, 250, 250, 0.78)',
  fontSize: 13.5,
  fontWeight: 500,
  cursor: 'pointer',
  padding: '6px 16px',
};
