import { KEYS } from '@hanzo/app/help';
import { DEV_MODE_NOTE, useDevMode } from '@hanzo/build/dev-mode';
import { Text, XStack, YStack } from '@hanzo/gui';
import { Button, Kbd, Switch } from '@hanzo/ui';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
  ArrowLeft,
  Cpu,
  Globe,
  Keyboard,
  Mic,
  Palette,
  Radio,
  RefreshCw,
  Sliders,
  Sparkles,
  User,
} from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { ProvidersListSection } from './LibraryPane';
import { openLocalAiManager } from './local-ai';
import { isTauriAvailable, safeInvoke } from './utils/tauri-check';

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

type SettingsSectionId =
  | 'general'
  | 'appearance'
  | 'providers'
  | 'voice'
  | 'engine'
  | 'zap'
  | 'extension'
  | 'account'
  | 'shortcuts';

type SidebarStylePref = 'flat' | 'nested';

type AppearanceProfile = 'zen' | 'lelouch' | 'light';

interface DetectedToolRow {
  id: string;
  name: string;
  category: string;
  installed: boolean;
  logged_in: boolean;
  path?: string | null;
  detail: string;
}

interface ZapNodeRow {
  id?: string;
  name?: string;
  url?: string;
  kind?: string;
  protocol?: string;
  status?: string;
  tools?: unknown[];
}

function readLocalPref<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeLocalPref(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function SettingsRow({
  title,
  description,
  control,
  last = false,
  testId,
}: {
  title: string;
  description?: string;
  control: ReactNode;
  last?: boolean;
  testId?: string;
}) {
  return (
    <XStack
      data-testid={testId}
      alignItems="center"
      justifyContent="space-between"
      gap="$4"
      paddingVertical="$3"
      paddingHorizontal="$4"
      borderBottomWidth={last ? 0 : 1}
      borderBottomColor="rgba(255,255,255,0.06)"
    >
      <YStack flex={1} minWidth={0} gap="$1">
        <Text fontSize={13} fontWeight="500" color="$color">
          {title}
        </Text>
        {description ? (
          <Text fontSize={12} color="$colorMuted" lineHeight={17}>
            {description}
          </Text>
        ) : null}
      </YStack>
      <XStack alignItems="center" gap="$2" flexShrink={0}>
        {control}
      </XStack>
    </XStack>
  );
}

function SettingsGroup({
  title,
  subtitle,
  children,
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <YStack gap="$2">
      {title ? (
        <YStack gap="$0.5" paddingHorizontal="$1">
          <Text fontSize={12} fontWeight="600" color="$colorMuted">
            {title}
          </Text>
          {subtitle ? (
            <Text fontSize={12} color="$colorMuted" opacity={0.75}>
              {subtitle}
            </Text>
          ) : null}
        </YStack>
      ) : null}
      <YStack
        borderRadius={10}
        borderWidth={1}
        borderColor="rgba(255,255,255,0.08)"
        backgroundColor="rgba(255,255,255,0.025)"
        overflow="hidden"
      >
        {children}
      </YStack>
    </YStack>
  );
}

function StatusPill({ online, loading }: { online: boolean | null; loading?: boolean }) {
  const isChecking = loading || online === null;
  const dot = isChecking ? '#71717a' : online ? '#22c55e' : '#71717a';
  const label = isChecking ? 'checking…' : online ? 'online' : 'not running';
  return (
    <XStack
      alignItems="center"
      gap="$1.5"
      paddingHorizontal="$2.5"
      paddingVertical="$1"
      borderRadius={999}
      borderWidth={1}
      borderColor="rgba(255,255,255,0.1)"
      backgroundColor="rgba(255,255,255,0.03)"
    >
      <YStack width={6} height={6} borderRadius={999} style={{ backgroundColor: dot }} />
      <Text fontSize={11} fontWeight="500" color="$colorMuted">
        {label}
      </Text>
    </XStack>
  );
}

/**
 * The section an address names (`/settings/zap`). Bare `/settings` is General; any
 * other address (the app's Profile, Personalization, Organization) is Account, which
 * says where those pages are: hanzo.ai's.
 */
export function sectionOf(path: string): SettingsSectionId {
  const name = path.replace(/^\/settings\/?/, '').split('/')[0] || 'general';
  return VALID_SECTIONS.has(name as SettingsSectionId) ? (name as SettingsSectionId) : 'account';
}

const VALID_SECTIONS = new Set<SettingsSectionId>([
  'general',
  'appearance',
  'providers',
  'voice',
  'engine',
  'zap',
  'extension',
  'account',
  'shortcuts',
]);

export function DesktopSettings({
  initialSection,
  isAuthenticated,
  siteUrl = 'https://hanzo.ai',
  localEngineUrl = 'http://localhost:36900',
  barInset = 0,
  onSignIn,
  onBack,
}: {
  initialSection?: SettingsSectionId;
  isAuthenticated: boolean;
  siteUrl?: string;
  localEngineUrl?: string;
  barInset?: number;
  onSignIn: () => void;
  onBack: () => void;
}) {
  const apple = /Mac|iPhone|iPad/.test(navigator.userAgent);
  const [profile, setProfile] = useState<AppearanceProfile>(() => {
    try {
      const raw = window.localStorage.getItem('hanzo.appearance');
      if (raw) {
        const parsed = JSON.parse(raw) as { profile?: string; theme?: string };
        if (parsed.profile === 'lelouch') return 'lelouch';
        if (parsed.profile === 'light' || parsed.theme === 'light') return 'light';
        if (parsed.profile === 'zen') return 'zen';
      }
    } catch {}
    return document.documentElement.classList.contains('light') ? 'light' : 'zen';
  });
  const theme: 'dark' | 'light' = profile === 'light' ? 'light' : 'dark';
  const [sidebarStyle, setSidebarStyle] = useState<SidebarStylePref>(() => {
    try {
      return window.localStorage.getItem('hanzo.sidebar.style') === 'nested' ? 'nested' : 'flat';
    } catch {
      return 'flat';
    }
  });
  const [privateByDefault, setPrivateByDefault] = useState<boolean>(() =>
    readLocalPref<boolean>('hanzo.pref.privateByDefault', false),
  );
  const [memoryEnabled, setMemoryEnabled] = useState<boolean>(() =>
    readLocalPref<boolean>('hanzo.pref.memoryEnabled', true),
  );
  const [ensoAutoRoute, setEnsoAutoRoute] = useState<boolean>(() =>
    readLocalPref<boolean>('hanzo.pref.ensoAutoRoute', true),
  );
  const [fnVoiceEnabled, setFnVoiceEnabled] = useState<boolean>(() =>
    readLocalPref<boolean>('hanzo.pref.fnVoice', true),
  );
  const [autoLinkMachines, setAutoLinkMachines] = useState<boolean>(() =>
    readLocalPref<boolean>('hanzo.pref.autoLinkMachines', true),
  );
  const [engineUp, setEngineUp] = useState<boolean | null>(null);
  const [ollamaUp, setOllamaUp] = useState<boolean | null>(null);
  const [zapNodes, setZapNodes] = useState<ZapNodeRow[]>([]);
  const [zapLoading, setZapLoading] = useState<boolean>(false);
  const [detectedTools, setDetectedTools] = useState<DetectedToolRow[]>([]);
  const [toolsLoading, setToolsLoading] = useState<boolean>(false);
  const [devMode, setDevMode] = useDevMode();
  // Mining's switch (src-tauri mining `is_enabled`): off until the person turns it on.
  // Null outside the desktop app, where there is nothing to share.
  const [mining, setMining] = useState<boolean | null>(null);
  useEffect(() => {
    if (!isTauriAvailable()) return;
    invoke<boolean>('mining_get_enabled').then(setMining, () => setMining(null));
  }, []);
  const turnMining = (on: boolean) => {
    setMining(on);
    invoke('mining_set_enabled', { on }).catch(() => setMining(!on));
  };
  const [section, setSection] = useState<SettingsSectionId>(initialSection ?? 'general');

  const refreshZap = useCallback(() => {
    setZapLoading(true);
    safeInvoke<ZapNodeRow[]>('zap_nodes')
      .then((nodes) => setZapNodes(Array.isArray(nodes) ? nodes : []))
      .catch(() => setZapNodes([]))
      .finally(() => setZapLoading(false));
  }, []);

  const refreshTools = useCallback(() => {
    setToolsLoading(true);
    safeInvoke<DetectedToolRow[]>('detect_local_tools')
      .then((rows) => setDetectedTools(Array.isArray(rows) ? rows : []))
      .catch(() => setDetectedTools([]))
      .finally(() => setToolsLoading(false));
  }, []);

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
    const timer = setTimeout(() => ctrl.abort(), 1400);

    fetch(`${localEngineUrl}/health`, { signal: ctrl.signal })
      .then((r) => {
        if (r.ok) {
          if (!cancelled) setEngineUp(true);
          return;
        }
        return fetch(`${localEngineUrl}/health`, { signal: ctrl.signal }).then((r2) => {
          if (!cancelled) setEngineUp(r2.ok);
        });
      })
      .catch(() => {
        fetch(`${localEngineUrl}/health`, { signal: ctrl.signal })
          .then((r2) => {
            if (!cancelled) setEngineUp(r2.ok);
          })
          .catch(() => {
            if (!cancelled) setEngineUp(false);
          });
      });

    fetch('http://127.0.0.1:11434/api/tags', { signal: ctrl.signal })
      .then((r) => {
        if (!cancelled) setOllamaUp(r.ok);
      })
      .catch(() => {
        if (!cancelled) setOllamaUp(false);
      });

    refreshZap();
    refreshTools();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [localEngineUrl, refreshZap, refreshTools]);

  const applyProfile = (next: AppearanceProfile) => {
    setProfile(next);
    const nextTheme = next === 'light' ? 'light' : 'dark';
    writeLocalPref('hanzo.appearance', { theme: nextTheme, profile: next });
    document.documentElement.dataset.themeProfile = next;
    document.documentElement.classList.remove('dark', 'light', 't_dark', 't_light');
    document.documentElement.classList.add(nextTheme, `t_${nextTheme}`);
    window.dispatchEvent(new CustomEvent('hanzo:appearance-change', { detail: { profile: next, theme: nextTheme } }));
  };

  const applySidebarStyle = (next: SidebarStylePref) => {
    setSidebarStyle(next);
    try {
      window.localStorage.setItem('hanzo.sidebar.style', next);
      window.dispatchEvent(new CustomEvent('hanzo:sidebar-style', { detail: next }));
    } catch {}
  };

  const navGroups: Array<{
    group: string;
    items: Array<{ id: SettingsSectionId; label: string; icon: ReactNode }>;
  }> = [
    {
      group: 'Workspace',
      items: [
        { id: 'general', label: 'General', icon: <Sliders size={14} strokeWidth={1.6} /> },
        { id: 'appearance', label: 'Appearance & Sidebar', icon: <Palette size={14} strokeWidth={1.6} /> },
        { id: 'voice', label: 'Voice & Commands', icon: <Mic size={14} strokeWidth={1.6} /> },
        { id: 'shortcuts', label: 'Keyboard Shortcuts', icon: <Keyboard size={14} strokeWidth={1.6} /> },
      ],
    },
    {
      group: 'Intelligence',
      items: [
        { id: 'providers', label: 'Providers & Models', icon: <Sparkles size={14} strokeWidth={1.6} /> },
        { id: 'engine', label: 'Local AI & Engine', icon: <Cpu size={14} strokeWidth={1.6} /> },
      ],
    },
    {
      group: 'Transport & Runtime',
      items: [
        { id: 'zap', label: 'Native ZAP Router', icon: <Radio size={14} strokeWidth={1.6} /> },
        { id: 'extension', label: 'Browser Extension', icon: <Globe size={14} strokeWidth={1.6} /> },
      ],
    },
    {
      group: 'Account',
      items: [
        { id: 'account', label: 'Account & Cloud KMS', icon: <User size={14} strokeWidth={1.6} /> },
      ],
    },
  ];

  const isLight = theme === 'light';

  return (
    <YStack
      data-testid="desktop-settings-page"
      height="100vh"
      width="100vw"
      backgroundColor={isLight ? '#fafafa' : profile === 'lelouch' ? '#0a0a0a' : '#000000'}
      color={isLight ? '#0a0a0a' : '#fafafa'}
    >
      {/* Top bar — Linear-density header */}
      <XStack
        data-tauri-drag-region
        height={40}
        alignItems="center"
        justifyContent="space-between"
        paddingLeft={barInset + 10}
        paddingRight={14}
        borderBottomWidth={1}
        borderBottomColor={isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)'}
        flexShrink={0}
      >
        <Button
          size="xs"
          variant="ghost"
          data-testid="desktop-settings-back"
          onPress={onBack}
          icon={<ArrowLeft size={13} strokeWidth={1.7} />}
        >
          Back to Hanzo
        </Button>
        <Text fontSize={12} fontWeight="500" color="$colorMuted">
          Settings
        </Text>
        <XStack width={92} justifyContent="flex-end">
          <Kbd>Esc</Kbd>
        </XStack>
      </XStack>

      <XStack flex={1} minHeight={0} overflow="hidden">
        {/* Left Linear-style grouped navigation */}
        <YStack
          tag="nav"
          aria-label="Settings sections"
          width={216}
          flexShrink={0}
          paddingVertical="$3"
          paddingHorizontal="$2"
          gap="$3"
          borderRightWidth={1}
          borderRightColor={isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)'}
          overflow="scroll"
        >
          {navGroups.map(({ group, items }) => (
            <YStack key={group} gap="$0.5">
              <Text
                fontSize={11}
                fontWeight="500"
                color="$colorMuted"
                paddingHorizontal="$2.5"
                paddingBottom="$1"
                opacity={0.7}
              >
                {group}
              </Text>
              {items.map((item) => {
                const active = section === item.id;
                return (
                  <Button
                    key={item.id}
                    size="sm"
                    variant="ghost"
                    justifyContent="flex-start"
                    gap="$2"
                    height={30}
                    paddingHorizontal="$2.5"
                    borderRadius={7}
                    backgroundColor={
                      active
                        ? isLight
                          ? 'rgba(0,0,0,0.06)'
                          : 'rgba(255,255,255,0.07)'
                        : 'transparent'
                    }
                    color={active ? '$color' : '$colorMuted'}
                    fontWeight={active ? '500' : '400'}
                    fontSize={13}
                    onPress={() => setSection(item.id)}
                  >
                    {item.icon}
                    <Text fontSize={13} fontWeight={active ? '500' : '400'} color="inherit">
                      {item.label}
                    </Text>
                  </Button>
                );
              })}
            </YStack>
          ))}
        </YStack>

        {/* Right detail pane */}
        <YStack flex={1} overflow="scroll" paddingVertical="$6" paddingHorizontal="$7">
          <YStack maxWidth={660} width="100%" marginHorizontal="auto" gap="$5" paddingBottom="$10">
            {section === 'general' ? (
              <>
                <YStack gap="$1">
                  <Text fontSize={18} fontWeight="600" color="$color">
                    General
                  </Text>
                  <Text fontSize={13} color="$colorMuted">
                    Core behavior across Hanzo Chat, Dev, Library, Design, and Plugins.
                  </Text>
                </YStack>

                <SettingsGroup title="Execution & Intelligence">
                  <SettingsRow
                    testId="desktop-dev-mode"
                    title="Developer mode"
                    description={DEV_MODE_NOTE}
                    control={
                      <Switch
                        data-testid="desktop-dev-mode-switch"
                        aria-label="Developer mode"
                        checked={devMode}
                        onCheckedChange={(v: boolean) => setDevMode(Boolean(v))}
                      />
                    }
                  />
                  {mining !== null && (
                    <SettingsRow
                      testId="desktop-mining"
                      title="Earn rewards by sharing this computer's power"
                      description="While on, this app uses this computer's processor in the background, once a minute, to make work proofs for its network; rewards are counted on this computer and are not paid out yet."
                      control={
                        <Switch
                          aria-label="Earn rewards by sharing this computer's power"
                          data-testid="desktop-mining-switch"
                          checked={mining}
                          onCheckedChange={(v: boolean) => turnMining(Boolean(v))}
                        />
                      }
                    />
                  )}
                  <SettingsRow
                    title="Enso automatic model routing"
                    description="Automatically pick the fastest frontier or local Zen model for each turn."
                    control={
                      <Switch
                        aria-label="Enso automatic routing"
                        checked={ensoAutoRoute}
                        onCheckedChange={(v: boolean) => {
                          const next = Boolean(v);
                          setEnsoAutoRoute(next);
                          writeLocalPref('hanzo.pref.ensoAutoRoute', next);
                        }}
                      />
                    }
                  />
                  <SettingsRow
                    title="Workspace memory"
                    description="Remember preferences, coding conventions, and project context across chats."
                    control={
                      <Switch
                        aria-label="Workspace memory"
                        checked={memoryEnabled}
                        onCheckedChange={(v: boolean) => {
                          const next = Boolean(v);
                          setMemoryEnabled(next);
                          writeLocalPref('hanzo.pref.memoryEnabled', next);
                        }}
                      />
                    }
                  />
                  <SettingsRow
                    title="Private mode by default"
                    description="Start new chats with /private enabled (zero cloud retention, local Zen inference preferred)."
                    last
                    control={
                      <Switch
                        aria-label="Private mode by default"
                        checked={privateByDefault}
                        onCheckedChange={(v: boolean) => {
                          const next = Boolean(v);
                          setPrivateByDefault(next);
                          writeLocalPref('hanzo.pref.privateByDefault', next);
                        }}
                      />
                    }
                  />
                </SettingsGroup>

                <SettingsGroup title="Linked Machines & Environments">
                  <SettingsRow
                    title="Auto-connect linked machines"
                    description="Discover your local Macs, Linux workstations, and cloud sandboxes over native ZAP."
                    control={
                      <Switch
                        aria-label="Auto-connect linked machines"
                        checked={autoLinkMachines}
                        onCheckedChange={(v: boolean) => {
                          const next = Boolean(v);
                          setAutoLinkMachines(next);
                          writeLocalPref('hanzo.pref.autoLinkMachines', next);
                        }}
                      />
                    }
                  />
                  <SettingsRow
                    title="Cloud workspaces & teams"
                    description="Manage organizations, billing, API keys, and shared environments on hanzo.ai."
                    last
                    control={
                      <Button
                        size="xs"
                        variant="outline"
                        onPress={() => void openUrl(`${siteUrl}/settings`)}
                      >
                        Open Cloud Settings ↗
                      </Button>
                    }
                  />
                </SettingsGroup>
              </>
            ) : null}

            {section === 'appearance' ? (
              <>
                <YStack gap="$1">
                  <Text fontSize={18} fontWeight="600" color="$color">
                    Appearance & Sidebar
                  </Text>
                  <Text fontSize={13} color="$colorMuted">
                    Customize theme and navigation density across Hanzo.
                  </Text>
                </YStack>

                <SettingsGroup title="Theme Profile">
                  <SettingsRow
                    title="Appearance profile"
                    description="Zen is pure Hanzo Dev black (default). Lelouch is the obsidian dark grey palette."
                    last
                    control={
                      <XStack gap="$1.5">
                        {(
                          [
                            ['zen', 'Zen'],
                            ['lelouch', 'Lelouch'],
                            ['light', 'Light'],
                          ] as const
                        ).map(([opt, label]) => (
                          <Button
                            key={opt}
                            size="xs"
                            data-testid={`desktop-theme-${opt}`}
                            variant={profile === opt ? 'primary' : 'outline'}
                            onPress={() => applyProfile(opt)}
                          >
                            {label}
                          </Button>
                        ))}
                      </XStack>
                    }
                  />
                </SettingsGroup>

                <SettingsGroup title="Sidebar Navigation">
                  <SettingsRow
                    title="Expanded sidebar layout"
                    description="Flat lists apps (<icon> Chat, <icon> Dev) in one clean column. Nested pairs the single icon rail (click top Org badge to switch workspaces) with per-app options."
                    control={
                      <XStack gap="$1.5">
                        {(
                          [
                            ['flat', 'Flat'],
                            ['nested', 'Nested'],
                          ] as const
                        ).map(([opt, label]) => (
                          <Button
                            key={opt}
                            size="xs"
                            variant={sidebarStyle === opt ? 'primary' : 'outline'}
                            onPress={() => applySidebarStyle(opt)}
                          >
                            {label}
                          </Button>
                        ))}
                      </XStack>
                    }
                  />
                  <SettingsRow
                    title="Sidebar toggle"
                    description="Toggle between Compact (single rail with hover-peek) and Expanded sidebar."
                    last
                    control={<Kbd>{apple ? '⌘B' : 'Ctrl+B'}</Kbd>}
                  />
                </SettingsGroup>
              </>
            ) : null}

            {section === 'providers' ? (
              <>
                <XStack alignItems="center" justifyContent="space-between">
                  <YStack gap="$1">
                    <Text fontSize={18} fontWeight="600" color="$color">
                      Providers, Local Tools & Accounts
                    </Text>
                    <Text fontSize={13} color="$colorMuted">
                      Auto-detected local AI coding tools, logged-in accounts, browser extension via ZAP, and provider API keys.
                    </Text>
                  </YStack>
                  <Button
                    size="xs"
                    variant="outline"
                    icon={<RefreshCw size={12} />}
                    onPress={refreshTools}
                  >
                    {toolsLoading ? 'Scanning…' : 'Rescan'}
                  </Button>
                </XStack>

                <SettingsGroup
                  title="Detected Local AI Coding Tools, Accounts & Extension"
                  subtitle="Discovered automatically on this machine — Hanzo reuses your existing CLIs, sessions, and ZAP browser extension."
                >
                  {detectedTools.length === 0 ? (
                    <SettingsRow
                      title={toolsLoading ? 'Scanning local coding tools…' : 'No local tools detected'}
                      description="Install hanzo, claude, codex, gemini, opencode, aider, cursor, or Ollama to connect automatically."
                      last
                      control={<StatusPill online={false} loading={toolsLoading} />}
                    />
                  ) : (
                    detectedTools.map((tool, idx) => (
                      <SettingsRow
                        key={tool.id}
                        title={tool.name}
                        description={
                          tool.path
                            ? `${tool.detail} · ${tool.path}`
                            : tool.detail
                        }
                        last={idx === detectedTools.length - 1}
                        control={
                          <XStack alignItems="center" gap="$1.5">
                            {tool.logged_in ? (
                              <Kbd>{tool.category === 'extension' ? 'ZAP linked' : 'Logged in'}</Kbd>
                            ) : null}
                            <StatusPill online={tool.installed || tool.logged_in} />
                          </XStack>
                        }
                      />
                    ))
                  )}
                </SettingsGroup>

                <YStack gap="$2">
                  <Text fontSize={12} fontWeight="600" color="$colorMuted" paddingHorizontal="$1">
                    API Keys & Cloud Providers
                  </Text>
                  <ProvidersListSection />
                </YStack>
              </>
            ) : null}

            {section === 'voice' ? (
              <>
                <YStack gap="$1">
                  <Text fontSize={18} fontWeight="600" color="$color">
                    Voice & Composer Commands
                  </Text>
                  <Text fontSize={13} color="$colorMuted">
                    System-wide voice dictation and slash commands shared across Chat and Dev.
                  </Text>
                </YStack>

                <SettingsGroup title="Voice Input">
                  <SettingsRow
                    title="Fn push-to-talk & double-tap hands-free"
                    description="Hold Fn to dictate, or double-tap Fn to toggle continuous hands-free voice with multi-window mic lease arbitration."
                    last
                    control={
                      <Switch
                        aria-label="Fn voice shortcuts"
                        checked={fnVoiceEnabled}
                        onCheckedChange={(v: boolean) => {
                          const next = Boolean(v);
                          setFnVoiceEnabled(next);
                          writeLocalPref('hanzo.pref.fnVoice', next);
                        }}
                      />
                    }
                  />
                </SettingsGroup>

                <SettingsGroup title="Built-in Slash Commands">
                  {[
                    ['/private', 'Toggle zero-retention local/private chat for this session'],
                    ['/persona', 'Switch agent persona, tone, and system instructions'],
                    ['/model', 'Switch active provider or model inline'],
                    ['@ files', 'Attach files, folders, or code symbols directly from workspace'],
                    ['$ skills', 'Invoke installed skills, connectors, or MCP workflows'],
                  ].map(([cmd, desc], idx, arr) => (
                    <SettingsRow
                      key={cmd}
                      title={cmd}
                      description={desc}
                      last={idx === arr.length - 1}
                      control={<Kbd>{cmd}</Kbd>}
                    />
                  ))}
                </SettingsGroup>
              </>
            ) : null}

            {section === 'engine' ? (
              <>
                <YStack gap="$1">
                  <Text fontSize={18} fontWeight="600" color="$color">
                    Local AI & Inference Engine
                  </Text>
                  <Text fontSize={13} color="$colorMuted">
                    Run private Zen weights locally with Metal/CUDA GPU acceleration via Hanzo Engine or Ollama.
                  </Text>
                </YStack>

                <SettingsGroup title="Local Runtimes">
                  <SettingsRow
                    title="Hanzo Engine"
                    description={`Local inference server (${localEngineUrl})`}
                    control={<StatusPill online={engineUp} />}
                  />
                  <SettingsRow
                    title="Ollama"
                    description="Local GGUF runner on 127.0.0.1:11434"
                    control={<StatusPill online={ollamaUp} />}
                  />
                  <SettingsRow
                    title="Manage local weights & diagnostics"
                    description="Download Zen models and inspect GPU VRAM allocation."
                    control={
                      <XStack gap="$2">
                        <Button
                          size="xs"
                          variant="outline"
                          onPress={() => openLocalAiManager('models')}
                        >
                          Manage Models
                        </Button>
                        <Button
                          size="xs"
                          variant="outline"
                          onPress={() => openLocalAiManager('engine')}
                        >
                          Diagnostics
                        </Button>
                      </XStack>
                    }
                  />
                  <SettingsRow
                    title="Local engine benchmarks"
                    description="Throughput and D-LSA sparse-attention runs against the local engine."
                    last
                    control={
                      <Button
                        size="xs"
                        variant="outline"
                        data-testid="desktop-benchmarks"
                        onPress={() => window.history.pushState(null, '', '/benchmark')}
                      >
                        Open benchmarks
                      </Button>
                    }
                  />
                </SettingsGroup>
              </>
            ) : null}

            {section === 'zap' ? (
              <>
                <XStack alignItems="center" justifyContent="space-between">
                  <YStack gap="$1">
                    <Text fontSize={18} fontWeight="600" color="$color">
                      Native ZAP Router
                    </Text>
                    <Text fontSize={13} color="$colorMuted">
                      Zero-Copy Agent Protocol (zap-proto.io) — binary O(1) framing & post-quantum X25519+ML-KEM-768 transport.
                    </Text>
                  </YStack>
                  <Button
                    size="xs"
                    variant="outline"
                    icon={<RefreshCw size={12} />}
                    onPress={refreshZap}
                  >
                    Refresh
                  </Button>
                </XStack>

                <SettingsGroup title="Embedded Router">
                  <SettingsRow
                    title="zapd local router"
                    description="Replaces WebSocket/JSON overhead for MCP tools, browser tabs, CLI agents, and linked machines."
                    control={<StatusPill online={true} loading={zapLoading} />}
                  />
                  <SettingsRow
                    title="Active sub-protocols"
                    description="zap-mcp · zap-acp · zap-rns · zap-fix over UDS, TCP, WebTransport, and stdio"
                    last
                    control={<Kbd>{zapNodes.length} nodes</Kbd>}
                  />
                </SettingsGroup>

                <SettingsGroup
                  title="Connected ZAP Nodes"
                  subtitle="Live endpoints discovered by the embedded Hanzo ZAP router."
                >
                  {zapNodes.length === 0 ? (
                    <SettingsRow
                      title="No external ZAP peers connected yet"
                      description="Start hanzo-mcp, connect the Hanzo Browser Extension, or pair a linked machine to appear here."
                      last
                      control={
                        <Button
                          size="xs"
                          variant="outline"
                          onPress={() => void openUrl('https://zap-proto.io')}
                        >
                          zap-proto.io ↗
                        </Button>
                      }
                    />
                  ) : (
                    zapNodes.map((node, idx) => (
                      <SettingsRow
                        key={node.id ?? node.url ?? String(idx)}
                        title={node.name || node.id || 'ZAP Node'}
                        description={
                          [node.protocol || 'zap', node.url, node.kind]
                            .filter(Boolean)
                            .join(' · ') || 'Connected peer'
                        }
                        last={idx === zapNodes.length - 1}
                        control={<StatusPill online={node.status !== 'offline'} />}
                      />
                    ))
                  )}
                </SettingsGroup>
              </>
            ) : null}

            {section === 'extension' ? (
              <>
                <YStack gap="$1">
                  <Text fontSize={18} fontWeight="600" color="$color">
                    Browser Extension
                  </Text>
                  <Text fontSize={13} color="$colorMuted">
                    Connect Chrome, Firefox, or Safari over native ZAP & CDP so Hanzo can inspect live tabs and register your browser as a linked machine.
                  </Text>
                </YStack>

                <SettingsGroup title="Control Browser">
                  <SettingsRow
                    title="Hanzo Browser Extension"
                    description="DOM automation, live tab capture, and local WebGPU inference inside your browser."
                    last
                    control={
                      <Button
                        size="xs"
                        variant="outline"
                        onPress={() => void openUrl(`${siteUrl}/download`)}
                      >
                        Install Extension ↗
                      </Button>
                    }
                  />
                </SettingsGroup>
              </>
            ) : null}

            {section === 'account' ? (
              <>
                <YStack gap="$1">
                  <Text fontSize={18} fontWeight="600" color="$color">
                    Account & Cloud KMS
                  </Text>
                  <Text fontSize={13} color="$colorMuted">
                    Identity, organization workspaces, and end-to-end encrypted secrets via Hanzo KMS.
                  </Text>
                </YStack>

                <YStack data-testid="desktop-account">
<SettingsGroup title="Hanzo IAM & Secrets">
                  <SettingsRow
                    title={isAuthenticated ? 'Signed in to Hanzo Cloud' : 'Local-only session'}
                    description={
                      isAuthenticated
                        ? `Your profile, personalization, organization, billing, usage and API keys are on ${new URL(siteUrl).host}, in your browser.`
                        : 'Running locally without login. Sign in via Hanzo IAM to sync threads, machines, and KMS secrets.'
                    }
                    last
                    control={
                      isAuthenticated ? (
                        <Button
                          size="xs"
                          variant="outline"
                          onPress={() => void openUrl(`${siteUrl}/settings`)}
                        >
                          {`Open on ${new URL(siteUrl).host}`}
                        </Button>
                      ) : (
                        <Button size="xs" variant="primary" onPress={onSignIn}>
                          Sign in to Hanzo
                        </Button>
                      )
                    }
                  />
                </SettingsGroup>
                </YStack>
              </>
            ) : null}

            {section === 'shortcuts' ? (
              <>
                <YStack gap="$1">
                  <Text fontSize={18} fontWeight="600" color="$color">
                    Keyboard Shortcuts
                  </Text>
                  <Text fontSize={13} color="$colorMuted">
                    Global and workspace shortcuts active across Hanzo.
                  </Text>
                </YStack>

                <SettingsGroup title="Navigation & Actions">
                  {[
                    ...KEYS.map((k) => ({ does: String(k.does), mac: k.mac, pc: k.pc })),
                    ...DESKTOP_GLOBAL_KEYS,
                    { does: 'Split terminal pane vertically', mac: '⌘D', pc: 'Ctrl+D' },
                    { does: 'Split terminal pane horizontally', mac: '⇧⌘D', pc: 'Ctrl+Shift+D' },
                    { does: 'Close active terminal tab', mac: '⌘W', pc: 'Ctrl+W' },
                  ].map((item, idx, arr) => (
                    <SettingsRow
                      key={item.does}
                      title={item.does}
                      last={idx === arr.length - 1}
                      control={<Kbd>{apple ? item.mac : item.pc}</Kbd>}
                    />
                  ))}
                </SettingsGroup>
              </>
            ) : null}
          </YStack>
        </YStack>
      </XStack>
    </YStack>
  );
}
