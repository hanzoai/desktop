import { KEYS } from '@hanzo/app/help';
import { getBrand } from '@hanzo/desktop-brand-config';
import { apply, read, write, type Preference } from '@hanzo/appearance';
import { DEV_MODE_NOTE, useDevMode } from '@hanzo/build/dev-mode';
import { Button, Kbd, Switch, Text, ToggleGroup, ToggleGroupItem, XStack, YStack } from '@hanzo/ui';
import { Card, Group, Heading, Row, Settings } from '@hanzo/ui/settings';
import { ArrowLeft } from '@hanzogui/lucide-icons-2';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useCallback, useEffect, useState } from 'react';

import { keychain } from './keychain';
import { ProvidersListSection } from './LibraryPane';
import { engineStatus, LOCAL_ENGINE_URL, sourceForRepo } from './lib/local-models';
import { LOCAL_MODELS_UPDATED_EVENT, openLocalAiManager, probeInstalledLocalModels } from './local-ai';
import { isTauriAvailable, safeInvoke } from './utils/tauri-check';

export type Platform = 'mac' | 'other';

export const platformOf = (ua: string): Platform => (/Mac|iPhone|iPad/.test(ua) ? 'mac' : 'other');

/**
 * What the window adds to @hanzo/app's KEYS, each answered by the host
 * (host.tsx, `windowKey`) or by main.rs, and merged into the app's row of the
 * same name below: one row per action, never a second "New chat". ⇧⌘I is the
 * system-wide key main.rs registers (`super+shift+i` and `control+shift+i`,
 * both on every platform); ⇧⌘J (Spotlight) is not registered until Spotlight
 * can send. Hold / double-tap Fn is not here: Windows and Linux keyboards
 * resolve Fn in firmware, so no key event ever reaches the window, and macOS
 * gives a Fn (Globe) press to Dictation or the emoji picker by default. ⌘⇧M is
 * the voice key.
 */
export const DESKTOP_KEYS = [
  { does: 'New chat', mac: '⌘N', pc: 'Ctrl+N', group: 'Navigation' },
  { does: 'New chat', mac: '⇧⌘I', pc: 'Ctrl+Shift+I', group: 'Navigation' },
  { does: 'Voice input', mac: '⌘⇧M', pc: 'Ctrl+Shift+M', group: 'Chat' },
  { does: 'Split terminal vertically', mac: '⌘D', pc: 'Ctrl+D', group: 'Tabs' },
  { does: 'Split terminal horizontally', mac: '⇧⌘D', pc: 'Ctrl+Shift+D', group: 'Tabs' },
  { does: 'Close active terminal pane', mac: '⌘W', pc: 'Ctrl+W', group: 'Tabs' },
  { does: 'Increase terminal text size', mac: '⌘+', pc: 'Ctrl++', group: 'Tabs' },
  { does: 'Decrease terminal text size', mac: '⌘-', pc: 'Ctrl+-', group: 'Tabs' },
] as const;

export interface ShortcutGroup {
  title: string;
  rows: { does: string; keys: string[] }[];
}

/**
 * Every shortcut, grouped, spelled for one platform: @hanzo/app's KEYS (each
 * answered where its comment in help.js says) and the window's own, one row per
 * action with a keycap per way to do it.
 */
export function shortcutGroups(platform: Platform): ShortcutGroup[] {
  const spell = (k: { mac: string; pc: string }) => (platform === 'mac' ? k.mac : k.pc).split(' / ');
  const groups: ShortcutGroup[] = [];
  for (const k of [...KEYS, ...DESKTOP_KEYS]) {
    const title = String(k.group ?? 'General');
    let g = groups.find((x) => x.title === title);
    if (!g) groups.push((g = { title, rows: [] }));
    const row = g.rows.find((r) => r.does === k.does);
    if (row) row.keys.push(...spell(k));
    else g.rows.push({ does: String(k.does), keys: spell(k) });
  }
  return groups;
}

export interface LocalModelsStatus {
  label: 'Checking…' | 'Not set up' | 'Ready' | 'Running';
  detail: string;
}

const models = (n: number) => (n === 1 ? '1 model' : `${n} models`);

/**
 * The Local models card's one line, and it says what the Local AI manager says
 * (lib/local-models `overall`): how many models are downloaded (null while still
 * asking), the model the engine serves (its title, null when none), whether an
 * engine is installed at all (null when that cannot be asked, as in a plain
 * browser), and whether the window holds a session. Downloaded models answer
 * nothing without an engine, so a missing engine is said first. The engine
 * serves one model, so Running names it; signed in, chat goes to the cloud
 * (host.tsx), so that is said instead of "can answer your chats".
 */
export function localModelsStatus(
  count: number | null,
  serving: string | null,
  engineInstalled: boolean | null = null,
  signedIn = false,
): LocalModelsStatus {
  const cloud = signedIn ? ` You are signed in, so chat uses ${getBrand().name}’s cloud models.` : '';
  if (count === null) return { label: 'Checking…', detail: 'Looking for models on this computer.' };
  if (engineInstalled === false && !serving)
    return {
      label: 'Not set up',
      detail: 'Hanzo’s engine, which runs models on this computer, is not installed.',
    };
  if (count === 0)
    return {
      label: 'Not set up',
      detail: 'No model is installed on this computer yet. Add one to chat without signing in.',
    };
  if (serving) return { label: 'Running', detail: `The Hanzo engine is running ${serving}.${cloud}` };
  return signedIn
    ? { label: 'Ready', detail: `${models(count)} on this computer.${cloud}` }
    : { label: 'Ready', detail: `${models(count)} on this computer can answer your chats.` };
}

/** What a key press asks of the window itself (`windowKey`). */
export type WindowAct = 'new-chat' | 'voice';

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

const SECTIONS = [
  { id: 'account', label: 'Account', group: 'Account & Billing' },
  { id: 'usage', label: 'Usage & Billing', group: 'Account & Billing' },
  { id: 'general', label: 'General', group: 'Preferences' },
  { id: 'appearance', label: 'Appearance', group: 'Preferences' },
  { id: 'terminal', label: 'Terminal & Editor', group: 'Preferences' },
  { id: 'shortcuts', label: 'Keyboard shortcuts', group: 'Preferences' },
  { id: 'providers', label: 'Models & Providers', group: 'Agents & Models' },
  { id: 'agents', label: 'Agents, MCP & Tools', group: 'Agents & Models' },
  { id: 'local-models', label: 'Local models', group: 'Agents & Models' },
  { id: 'environments', label: 'Environments & Machines', group: 'Connections' },
  { id: 'zap', label: 'ZAP & Extensions', group: 'Connections' },
  { id: 'advanced', label: 'Advanced', group: 'System' },
] as const;
type Section = (typeof SECTIONS)[number]['id'];

type AppearanceProfile = 'zen' | 'lelouch' | 'light';
type SidebarStylePref = 'flat' | 'nested';

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
}

interface MachineRow {
  id?: string;
  name?: string;
  hostname?: string;
  status?: string;
  kind?: string;
}

interface HardwareSummary {
  cpu_model?: string;
  cpu_cores?: number;
  total_memory_gb?: number;
  gpu_name?: string;
  os_name?: string;
}

export interface DesktopSettingsUser {
  name?: string;
  email?: string;
  id?: string;
  avatar?: string;
  org?: string;
}

const SECTION_ALIASES: Record<string, Section> = {
  account: 'account',
  profile: 'account',
  personalization: 'account',
  usage: 'usage',
  billing: 'usage',
  keys: 'usage',
  general: 'general',
  appearance: 'appearance',
  theme: 'appearance',
  terminal: 'terminal',
  editor: 'terminal',
  shortcuts: 'shortcuts',
  keybindings: 'shortcuts',
  providers: 'providers',
  models: 'providers',
  agents: 'agents',
  mcp: 'agents',
  tools: 'agents',
  'local-models': 'local-models',
  environments: 'environments',
  connections: 'environments',
  devices: 'environments',
  machines: 'environments',
  zap: 'zap',
  extensions: 'zap',
  advanced: 'advanced',
  maintenance: 'advanced',
  diagnostics: 'advanced',
};

/**
 * The section an address names (`/settings/advanced`). Any other settings address,
 * bare `/settings` included, opens Account.
 */
export const sectionOf = (path: string): Section => {
  const clean = path.replace(/\/+$/, '');
  const sub = clean.startsWith('/settings/') ? clean.slice('/settings/'.length).split('/')[0] : '';
  return SECTION_ALIASES[sub] ?? 'account';
};

const HANZOD_DAEMON_URL = 'http://127.0.0.1:3690';
const HANZOD_URL = 'http://127.0.0.1:9630';

/** Is something answering? null while asking. */
function useUp(ask: (signal: AbortSignal) => Promise<Response>): boolean | null {
  const [up, setUp] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1200);
    ask(ctrl.signal)
      .then((r) => live && setUp(r.ok))
      .catch(() => live && setUp(false));
    return () => {
      live = false;
      clearTimeout(timer);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return up;
}

const say = (up: boolean | null) => (up === null ? 'checking…' : up ? 'responding' : 'not responding');

function readPref(key: string, fallback: string): string {
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writePref(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore storage errors
  }
}

function readBoolPref(key: string, fallback: boolean): boolean {
  try {
    const v = window.localStorage.getItem(key);
    if (v === null) return fallback;
    return v === 'true' || v === '1';
  } catch {
    return fallback;
  }
}

function decodeJwtClaims(): DesktopSettingsUser | null {
  try {
    const token = keychain.getItem('hanzo_iam_access_token');
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const json = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return {
      name: json.displayName || json.name || json.preferred_username || '',
      email: json.email || '',
      id: json.sub || json.id || '',
      avatar: typeof json.avatar === 'string' ? json.avatar : '',
      org: json.owner || json.org || '',
    };
  } catch {
    return null;
  }
}

function initialsOf(name?: string, email?: string): string {
  const src = (name || email || 'H').trim();
  const parts = src.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

/**
 * Hanzo Desktop Settings — full Hanzo Dev settings architecture brought directly
 * into Desktop: Account & Profile, Usage & Billing, General, Appearance, Terminal & Editor,
 * Keyboard shortcuts, Models & Providers, Agents/MCP/Tools, Local models,
 * Environments & Linked Machines, ZAP & Extensions, and Advanced.
 */
export function DesktopSettings({
  isAuthenticated,
  user,
  apiUrl,
  siteUrl = 'https://hanzo.ai',
  barInset = 0,
  onSignIn,
  onSignOut,
  onBack,
}: {
  isAuthenticated: boolean;
  user?: DesktopSettingsUser | null;
  apiUrl?: string;
  siteUrl?: string;
  barInset?: number;
  onSignIn: () => void;
  onSignOut?: () => void | Promise<void>;
  onBack: () => void;
}) {
  const platform = platformOf(navigator.userAgent);
  const resolvedApi = apiUrl ?? getBrand().cloudApi;
  const siteHost = new URL(siteUrl).host;
  const identity: DesktopSettingsUser | null = isAuthenticated
    ? (user && (user.name || user.email || user.id) ? user : decodeJwtClaims())
    : null;

  const [section, setSection] = useState<Section>(() => sectionOf(window.location.pathname));

  // Appearance state
  const [theme, setTheme] = useState<Preference['theme']>(() => read().theme ?? 'system');
  const [profile, setProfile] = useState<AppearanceProfile>(() => {
    try {
      const raw = window.localStorage.getItem('hanzo.appearance');
      if (raw) {
        const parsed = JSON.parse(raw) as { profile?: string; theme?: string };
        if (parsed.profile === 'lelouch') return 'lelouch';
        if (parsed.profile === 'light' || parsed.theme === 'light') return 'light';
      }
    } catch {}
    return 'zen';
  });
  const [sidebarStyle, setSidebarStyle] = useState<SidebarStylePref>(() =>
    readPref('hanzo.sidebar.style', 'flat') === 'nested' ? 'nested' : 'flat',
  );
  const [uiDensity, setUiDensity] = useState<'compact' | 'comfortable'>(() =>
    readPref('hanzo.ui.density', 'comfortable') === 'compact' ? 'compact' : 'comfortable',
  );

  // General & Personalization state
  const [defaultRoom, setDefaultRoom] = useState<string>(() => readPref('hanzo.desktop.defaultRoom', 'chat'));
  const [notifyOnDone, setNotifyOnDone] = useState<boolean>(() => readBoolPref('hanzo.desktop.notifyOnDone', true));
  const [soundEffects, setSoundEffects] = useState<boolean>(() => readBoolPref('hanzo.desktop.soundEffects', false));
  const [autoCheckUpdates, setAutoCheckUpdates] = useState<boolean>(() => readBoolPref('hanzo.desktop.autoUpdates', true));
  const [customInstructions, setCustomInstructions] = useState<string>(() =>
    readPref('hanzo.agent.instructions', ''),
  );
  const [instructionsSaved, setInstructionsSaved] = useState(false);

  // Terminal & Editor state
  const [termFontSize, setTermFontSize] = useState<number>(() => {
    const n = Number(readPref('hanzo.tabs.size.v1', '13'));
    return Number.isFinite(n) && n >= 10 && n <= 24 ? n : 13;
  });
  const [defaultShell, setDefaultShell] = useState<string>(() => readPref('hanzo.terminal.shell', '/bin/zsh'));
  const [cursorStyle, setCursorStyle] = useState<'block' | 'bar' | 'underline'>(() => {
    const v = readPref('hanzo.terminal.cursor', 'block');
    return v === 'bar' || v === 'underline' ? v : 'block';
  });
  const [preferredEditor, setPreferredEditor] = useState<string>(() => readPref('hanzo.editor.preferred', 'cursor'));
  const [editorWordWrap, setEditorWordWrap] = useState<boolean>(() => readBoolPref('hanzo.editor.wordWrap', true));

  // Models & Agents state
  const [defaultModel, setDefaultModel] = useState<string>(() => readPref('hanzo.chat.defaultModel', 'zen6'));
  const [reasoningEffort, setReasoningEffort] = useState<string>(() => readPref('hanzo.chat.effort', 'auto'));
  const [approvalMode, setApprovalMode] = useState<'auto' | 'manual'>(() =>
    readPref('hanzo.agent.approvalMode', 'auto') === 'manual' ? 'manual' : 'auto',
  );
  const [thirdPartyModels, setThirdPartyModels] = useState<boolean>(() =>
    readBoolPref('hanzo.chat.allowThirdPartyModels', true),
  );
  const [mcpEnabled, setMcpEnabled] = useState<boolean>(() => readBoolPref('hanzo.mcp.enabled', true));
  const [webSearchEnabled, setWebSearchEnabled] = useState<boolean>(() => readBoolPref('hanzo.tools.webSearch', true));
  const [shellExecEnabled, setShellExecEnabled] = useState<boolean>(() => readBoolPref('hanzo.tools.shellExec', true));

  // Cloud Usage & Billing snapshot
  const [billingSummary, setBillingSummary] = useState<{
    plan?: string;
    balance?: string;
    monthSpend?: string;
    loaded: boolean;
  }>({ loaded: false });
  const [cloudModelsCount, setCloudModelsCount] = useState<number | null>(null);

  // Advanced & system state
  const [devMode, setDevMode] = useDevMode();
  const [mining, setMining] = useState<boolean | null>(null);
  useEffect(() => {
    if (!isTauriAvailable()) return;
    invoke<boolean>('mining_get_enabled').then(setMining, () => setMining(null));
  }, []);
  const turnMining = (on: boolean) => {
    setMining(on);
    invoke('mining_set_enabled', { on }).catch(() => setMining(!on));
  };

  // Local AI / Tools / ZAP / Machines / Workspaces / Hardware
  const [count, setCount] = useState<number | null>(null);
  const [engineInstalled, setEngineInstalled] = useState<boolean | null>(null);
  const [serving, setServing] = useState<string | null>(null);
  const [detectedTools, setDetectedTools] = useState<DetectedToolRow[]>([]);
  const [toolsLoading, setToolsLoading] = useState(false);
  const [zapNodes, setZapNodes] = useState<ZapNodeRow[]>([]);
  const [zapLoading, setZapLoading] = useState(false);
  const [localDev, setLocalDev] = useState<{ id: string; origin: string; hostname?: string | null } | null>(null);
  const [machines, setMachines] = useState<MachineRow[]>([]);
  const [machinesLoading, setMachinesLoading] = useState(false);
  const [workspaces, setWorkspaces] = useState<Array<{ name: string; path: string }>>([]);
  const [hardware, setHardware] = useState<HardwareSummary | null>(null);

  const engineUp = useUp((signal) => fetch(`${LOCAL_ENGINE_URL}/health`, { signal }));
  const hanzodDaemonUp = useUp((signal) => fetch(`${HANZOD_DAEMON_URL}/v1/hanzod`, { signal }));
  const hanzodUp = useUp((signal) =>
    fetch(`${HANZOD_URL}/v1/chain/hanzo/rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
      signal,
    }),
  );

  const refreshTools = useCallback(() => {
    if (!isTauriAvailable()) return;
    setToolsLoading(true);
    safeInvoke<DetectedToolRow[]>('detect_local_tools')
      .then((rows) => setDetectedTools(Array.isArray(rows) ? rows : []))
      .catch(() => setDetectedTools([]))
      .finally(() => setToolsLoading(false));
  }, []);

  const refreshZap = useCallback(() => {
    if (!isTauriAvailable()) return;
    setZapLoading(true);
    safeInvoke<ZapNodeRow[]>('zap_nodes')
      .then((nodes) => setZapNodes(Array.isArray(nodes) ? nodes : []))
      .catch(() => setZapNodes([]))
      .finally(() => setZapLoading(false));
  }, []);

  const refreshEnvironments = useCallback(() => {
    if (!isTauriAvailable()) return;
    setMachinesLoading(true);
    Promise.all([
      safeInvoke<{ id: string; origin: string; hostname?: string | null } | null>('dev_local_runtime')
        .then((r) => setLocalDev(r ?? null))
        .catch(() => setLocalDev(null)),
      safeInvoke<MachineRow[]>('machine_list')
        .then((list) => setMachines(Array.isArray(list) ? list : []))
        .catch(() => setMachines([])),
    ]).finally(() => setMachinesLoading(false));
  }, []);

  useEffect(() => {
    if (section === 'providers' || section === 'agents') refreshTools();
    if (section === 'zap' || section === 'agents') refreshZap();
    if (section === 'environments') refreshEnvironments();
    if (section === 'general' && isTauriAvailable()) {
      safeInvoke<Array<{ name: string; path: string }>>('local_workspace_discover')
        .then((list) => setWorkspaces(Array.isArray(list) ? list : []))
        .catch(() => {});
    }
    if ((section === 'advanced' || section === 'local-models') && isTauriAvailable()) {
      safeInvoke<HardwareSummary>('hardware_get_summary')
        .then((h) => h && setHardware(h))
        .catch(() => {});
    }
  }, [section, refreshTools, refreshZap, refreshEnvironments]);

  // Fetch live cloud billing / usage / models summary when signed in
  useEffect(() => {
    if (!isAuthenticated) return;
    const token = keychain.getItem('hanzo_iam_access_token');
    if (!token) return;
    const ctrl = new AbortController();
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };

    if (section === 'account' || section === 'usage') {
      fetch(`${resolvedApi}/v1/billing/summary`, { headers, signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!data) {
            setBillingSummary((prev) => ({ ...prev, loaded: true }));
            return;
          }
          const bal =
            typeof data.balance_usd === 'number'
              ? `$${data.balance_usd.toFixed(2)}`
              : typeof data.balance === 'number'
                ? `$${(data.balance / 100).toFixed(2)}`
                : undefined;
          const spend =
            typeof data.month_spend_usd === 'number'
              ? `$${data.month_spend_usd.toFixed(2)}`
              : undefined;
          setBillingSummary({
            plan: data.plan_name || data.plan || data.tier || 'Active',
            balance: bal,
            monthSpend: spend,
            loaded: true,
          });
        })
        .catch(() => setBillingSummary((prev) => ({ ...prev, loaded: true })));
    }

    if (section === 'providers') {
      fetch(`${resolvedApi}/v1/models`, { headers, signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (Array.isArray(data?.data)) setCloudModelsCount(data.data.length);
        })
        .catch(() => {});
    }

    return () => ctrl.abort();
  }, [isAuthenticated, section, resolvedApi]);

  // Back is Escape, or the window's own Back (⌘[ on a Mac, Alt+← elsewhere).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        if (e.key !== 'Escape') return;
      }
      const back =
        e.key === 'Escape' ||
        (platform === 'mac' ? e.metaKey && e.key === '[' : e.altKey && e.key === 'ArrowLeft');
      if (!back) return;
      e.preventDefault();
      onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack, platform]);

  // The status line follows the Local AI manager: a model added there shows here.
  useEffect(() => {
    let live = true;
    const probe = () => {
      void probeInstalledLocalModels(true)
        .then((found) => live && setCount(found.length))
        .catch(() => live && setCount(0));
      void engineStatus()
        .then((status) => {
          if (!live) return;
          setEngineInstalled(status ? Boolean(status.engine) : null);
          setServing(status?.serving ? sourceForRepo(status.serving)?.title ?? status.serving : null);
        })
        .catch(() => live && setEngineInstalled(null));
    };
    probe();
    window.addEventListener(LOCAL_MODELS_UPDATED_EVENT, probe);
    return () => {
      live = false;
      window.removeEventListener(LOCAL_MODELS_UPDATED_EVENT, probe);
    };
  }, []);

  const pick = (id: Section) => {
    setSection(id);
    window.history.replaceState(null, '', `/settings/${id}`);
  };

  const applyTheme = (next: string | string[]) => {
    if (next !== 'system' && next !== 'light' && next !== 'dark') return;
    const nextProfile: AppearanceProfile = next === 'light' ? 'light' : profile === 'lelouch' ? 'lelouch' : 'zen';
    const pref = { ...read(), theme: next, profile: nextProfile } as Preference & { profile?: AppearanceProfile };
    write(pref);
    apply(pref);
    setTheme(next);
    setProfile(nextProfile);
    document.documentElement.dataset.themeProfile = nextProfile;
    window.dispatchEvent(new CustomEvent('hanzo:appearance-change', { detail: { profile: nextProfile, theme: next } }));
  };

  const applyProfile = (next: string | string[]) => {
    if (next !== 'zen' && next !== 'lelouch' && next !== 'light') return;
    const nextTheme: Preference['theme'] = next === 'light' ? 'light' : 'dark';
    const pref = { ...read(), theme: nextTheme, profile: next } as Preference & { profile?: AppearanceProfile };
    write(pref);
    apply(pref);
    setTheme(nextTheme);
    setProfile(next);
    document.documentElement.dataset.themeProfile = next;
    window.dispatchEvent(new CustomEvent('hanzo:appearance-change', { detail: { profile: next, theme: nextTheme } }));
  };

  const applySidebarStyle = (next: string | string[]) => {
    if (next !== 'flat' && next !== 'nested') return;
    setSidebarStyle(next);
    writePref('hanzo.sidebar.style', next);
    window.dispatchEvent(new CustomEvent('hanzo:sidebar-style', { detail: next }));
  };

  const updateTermFontSize = (nextSize: number) => {
    const clamped = Math.max(10, Math.min(24, nextSize));
    setTermFontSize(clamped);
    writePref('hanzo.tabs.size.v1', String(clamped));
  };

  const saveInstructions = () => {
    writePref('hanzo.agent.instructions', customInstructions);
    setInstructionsSaved(true);
    setTimeout(() => setInstructionsSaved(false), 1800);
  };

  const status = localModelsStatus(count, serving, engineInstalled, Boolean(keychain.getItem('hanzo_iam_access_token')));

  return (
    <YStack data-testid="desktop-settings-page" height="100vh" width="100vw" bg="$background">
      <XStack
        data-tauri-drag-region=""
        height={44}
        shrink={0}
        items="center"
        gap="$3"
        pl={barInset + 12}
        pr="$4"
        borderBottomWidth={1}
        borderColor="$borderColor"
      >
        <Button
          data-testid="desktop-settings-back"
          size="sm"
          variant="ghost"
          startIcon={<ArrowLeft size={14} />}
          onPress={onBack}
        >
          Back
        </Button>
      </XStack>

      <Settings entries={SECTIONS} active={section} onPick={pick} title="Settings">
        {section === 'account' ? (
          <YStack gap="$5" data-testid="desktop-account">
            <Heading
              title="Account & Profile"
              detail="Manage your Hanzo identity, organization, personalization, and cloud account."
            />
            <Card>
              {isAuthenticated ? (
                <>
                  <Row
                    first
                    title={identity?.name || 'Signed in'}
                    detail={
                      identity?.email
                        ? `${identity.email}${identity.org ? ` · Org: ${identity.org}` : ''}`
                        : `Your profile, personalization, organization, billing, usage and API keys are on ${siteHost}, in your browser.`
                    }
                    trailing={
                      <XStack gap="$2" items="center">
                        <div className="hz-settings-avatar" aria-hidden="true">
                          {identity?.avatar ? (
                            <img src={identity.avatar} alt="" />
                          ) : (
                            initialsOf(identity?.name, identity?.email)
                          )}
                        </div>
                        <Button size="sm" variant="outline" onPress={() => void openUrl(`${siteUrl}/settings`)}>
                          {`Open on ${siteHost}`}
                        </Button>
                      </XStack>
                    }
                  />
                  {identity?.email ? (
                    <Row
                      title="Cloud account portal"
                      detail={`Your profile, personalization, organization, billing, usage and API keys are on ${siteHost}, in your browser.`}
                      trailing={
                        <XStack gap="$2">
                          <Button size="sm" variant="outline" onPress={() => pick('usage')}>
                            Usage & Billing
                          </Button>
                          {onSignOut ? (
                            <Button size="sm" variant="outline" onPress={() => void onSignOut()}>
                              Sign out
                            </Button>
                          ) : null}
                        </XStack>
                      }
                    />
                  ) : null}
                </>
              ) : (
                <Row
                  first
                  title="Not signed in"
                  detail="Sign in for cloud models, synced chats, linked machines, and billing."
                  trailing={
                    <Button size="sm" variant="primary" onPress={onSignIn}>
                      Sign in
                    </Button>
                  }
                />
              )}
            </Card>

            <Group title="Organization & Access">
              <Card>
                <Row
                  first
                  title="Active organization"
                  detail={identity?.org ? `Working in ${identity.org}. Switch or manage team members and roles.` : 'Personal workspace. Create or manage an organization for shared billing and team agents.'}
                  trailing={
                    <Button size="sm" variant="outline" onPress={() => void openUrl(`${siteUrl}/settings/organization`)}>
                      Manage organization
                    </Button>
                  }
                />
                <Row
                  title="API keys & tokens"
                  detail="Create and revoke personal or organization API keys for Hanzo Gateway, CLI, and MCP."
                  trailing={
                    <Button size="sm" variant="outline" onPress={() => void openUrl('https://platform.hanzo.ai/api-keys')}>
                      Manage API keys
                    </Button>
                  }
                />
              </Card>
            </Group>

            <Group title="Personalization">
              <Card>
                <YStack p="$3.5" gap="$2.5">
                  <Text fontSize="$3" fontWeight="600" color="$ink">
                    Custom instructions
                  </Text>
                  <Text fontSize="$2" color="$soft">
                    Standing preferences prepended to your coding and chat sessions on this computer (coding style, stack, tone).
                  </Text>
                  <textarea
                    className="hz-settings-textarea"
                    value={customInstructions}
                    onChange={(e) => setCustomInstructions(e.target.value)}
                    placeholder="e.g. Prefer TypeScript, concise explanations, and verify builds before finishing."
                  />
                  <XStack justify="flex-end">
                    <Button size="sm" variant="outline" onPress={saveInstructions}>
                      {instructionsSaved ? 'Saved' : 'Save instructions'}
                    </Button>
                  </XStack>
                </YStack>
              </Card>
            </Group>
          </YStack>
        ) : null}

        {section === 'usage' ? (
          <YStack gap="$5" data-testid="desktop-usage">
            <Heading
              title="Usage & Billing"
              detail="Track your Hanzo plan, pre-paid compute balance, API spend, and invoices."
            />
            <Group title="Plan & Credits">
              <Card>
                <Row
                  first
                  title={isAuthenticated ? `Plan: ${billingSummary.plan ?? 'Hanzo Account'}` : 'Sign in to view plan'}
                  detail={
                    isAuthenticated
                      ? [
                          billingSummary.balance ? `Balance: ${billingSummary.balance}` : null,
                          billingSummary.monthSpend ? `This month: ${billingSummary.monthSpend}` : null,
                          'First-party Zen & Kai models are covered by your plan; third-party models draw from credits.',
                        ]
                          .filter(Boolean)
                          .join(' · ')
                      : 'Sign in with your Hanzo account to inspect live plan usage and credit balance.'
                  }
                  trailing={
                    isAuthenticated ? (
                      <Button size="sm" variant="outline" onPress={() => void openUrl(`${siteUrl}/billing`)}>
                        Manage billing
                      </Button>
                    ) : (
                      <Button size="sm" variant="primary" onPress={onSignIn}>
                        Sign in
                      </Button>
                    )
                  }
                />
                <Row
                  title="Token & compute usage"
                  detail="Inspect per-model token consumption, rate-limit windows, and daily spend charts."
                  trailing={
                    <Button size="sm" variant="outline" onPress={() => void openUrl(`${siteUrl}/usage`)}>
                      Open Usage dashboard
                    </Button>
                  }
                />
                <Row
                  title="Upgrade or add credits"
                  detail="Top up pre-paid compute credits, configure auto-reload, or compare Pro / Dev / Max plans."
                  trailing={
                    <Button size="sm" variant="outline" onPress={() => void openUrl(`${siteUrl}/pricing`)}>
                      View plans
                    </Button>
                  }
                />
              </Card>
            </Group>

            <Group title="API Keys">
              <Card>
                <Row
                  first
                  title="Hanzo Platform API Keys"
                  detail="Generate scoped API keys for CI/CD, hanzo CLI, and OpenAI-compatible gateway calls."
                  trailing={
                    <Button size="sm" variant="outline" onPress={() => void openUrl('https://platform.hanzo.ai/api-keys')}>
                      Open API Keys
                    </Button>
                  }
                />
                <Row
                  title="Local BYOK provider keys"
                  detail="Configure direct Anthropic, OpenAI, Google, xAI, DeepSeek, or Ollama credentials."
                  trailing={
                    <Button size="sm" variant="outline" onPress={() => pick('providers')}>
                      Configure providers
                    </Button>
                  }
                />
              </Card>
            </Group>
          </YStack>
        ) : null}

        {section === 'general' ? (
          <YStack gap="$5" data-testid="desktop-general">
            <Heading
              title="General"
              detail={`Default workspace behavior, notifications, and startup preferences for ${getBrand().name}.`}
            />
            <Group title="Startup & Workspace">
              <Card>
                <Row
                  first
                  title="Default opening room"
                  detail="Which surface Hanzo Desktop opens when launching a fresh window."
                  trailing={
                    <ToggleGroup
                      type="single"
                      size="sm"
                      variant="outline"
                      disableDeactivation
                      aria-label="Default opening room"
                      value={defaultRoom}
                      onValueChange={(v) => {
                        if (typeof v === 'string' && v) {
                          setDefaultRoom(v);
                          writePref('hanzo.desktop.defaultRoom', v);
                        }
                      }}
                    >
                      {(
                        [
                          ['chat', 'Chat'],
                          ['dev', 'Dev'],
                          ['tabs', 'Tabs'],
                          ['library', 'Library'],
                        ] as const
                      ).map(([opt, label]) => (
                        <ToggleGroupItem key={opt} value={opt}>
                          <Text fontSize="$2">{label}</Text>
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                  }
                />
                <Row
                  title="Discovered workspaces"
                  detail={
                    workspaces.length > 0
                      ? `${workspaces.length} local repositories/folders ready in Library & Files (${workspaces.slice(0, 3).map((w) => w.name).join(', ')}).`
                      : 'Open a folder in Library or Files to add local workspaces.'
                  }
                  trailing={
                    <Button
                      size="sm"
                      variant="outline"
                      onPress={() => {
                        onBack();
                        window.history.pushState(null, '', '/library');
                      }}
                    >
                      Open Library
                    </Button>
                  }
                />
              </Card>
            </Group>

            <Group title="Notifications & Updates">
              <Card>
                <Row
                  first
                  title="Notify when agent tasks finish"
                  detail="Show a desktop notification when long-running coding runs or builds complete."
                  trailing={
                    <Switch
                      aria-label="Notify when agent tasks finish"
                      checked={notifyOnDone}
                      onCheckedChange={(on: boolean) => {
                        setNotifyOnDone(on);
                        writePref('hanzo.desktop.notifyOnDone', String(on));
                      }}
                    />
                  }
                />
                <Row
                  title="Subtle completion sounds"
                  detail="Play a quiet chime when an agent finishes or requests approval."
                  trailing={
                    <Switch
                      aria-label="Subtle completion sounds"
                      checked={soundEffects}
                      onCheckedChange={(on: boolean) => {
                        setSoundEffects(on);
                        writePref('hanzo.desktop.soundEffects', String(on));
                      }}
                    />
                  }
                />
                <Row
                  title="Check for updates automatically"
                  detail="Download signed Hanzo Desktop releases in the background."
                  trailing={
                    <Switch
                      aria-label="Check for updates automatically"
                      checked={autoCheckUpdates}
                      onCheckedChange={(on: boolean) => {
                        setAutoCheckUpdates(on);
                        writePref('hanzo.desktop.autoUpdates', String(on));
                      }}
                    />
                  }
                />
              </Card>
            </Group>
          </YStack>
        ) : null}

        {section === 'appearance' ? (
          <YStack gap="$5" data-testid="desktop-appearance">
            <Heading title="Appearance" detail={`How ${getBrand().name} looks on this computer.`} />
            <Card>
              <Row
                first
                title="Theme"
                detail="System follows your computer's light or dark setting."
                trailing={
                  <ToggleGroup
                    type="single"
                    size="sm"
                    variant="outline"
                    disableDeactivation
                    aria-label="Theme"
                    value={theme}
                    onValueChange={applyTheme}
                  >
                    {(['system', 'light', 'dark'] as const).map((opt) => (
                      <ToggleGroupItem key={opt} value={opt} data-testid={`desktop-theme-${opt}`}>
                        <Text fontSize="$2">{opt === 'system' ? 'System' : opt === 'light' ? 'Light' : 'Dark'}</Text>
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                }
              />
              <Row
                title="Appearance profile"
                detail="Zen is pure Hanzo Dev black (default). Lelouch is the obsidian grey palette."
                trailing={
                  <ToggleGroup
                    type="single"
                    size="sm"
                    variant="outline"
                    disableDeactivation
                    aria-label="Appearance profile"
                    value={profile}
                    onValueChange={applyProfile}
                  >
                    {(
                      [
                        ['zen', 'Zen'],
                        ['lelouch', 'Lelouch'],
                        ['light', 'Light'],
                      ] as const
                    ).map(([opt, label]) => (
                      <ToggleGroupItem key={opt} value={opt} data-testid={`desktop-profile-${opt}`}>
                        <Text fontSize="$2">{label}</Text>
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                }
              />
              <Row
                title="Sidebar layout"
                detail="Flat lists apps in one column. Nested pairs the icon rail with per-app views."
                trailing={
                  <ToggleGroup
                    type="single"
                    size="sm"
                    variant="outline"
                    disableDeactivation
                    aria-label="Sidebar layout"
                    value={sidebarStyle}
                    onValueChange={applySidebarStyle}
                  >
                    {(
                      [
                        ['flat', 'Flat'],
                        ['nested', 'Nested'],
                      ] as const
                    ).map(([opt, label]) => (
                      <ToggleGroupItem key={opt} value={opt}>
                        <Text fontSize="$2">{label}</Text>
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                }
              />
              <Row
                title="Interface density"
                detail="Adjust row spacing across sidebars, thread lists, and file trees."
                trailing={
                  <ToggleGroup
                    type="single"
                    size="sm"
                    variant="outline"
                    disableDeactivation
                    aria-label="Interface density"
                    value={uiDensity}
                    onValueChange={(v) => {
                      if (v === 'compact' || v === 'comfortable') {
                        setUiDensity(v);
                        writePref('hanzo.ui.density', v);
                        document.documentElement.dataset.density = v;
                      }
                    }}
                  >
                    <ToggleGroupItem value="compact">
                      <Text fontSize="$2">Compact</Text>
                    </ToggleGroupItem>
                    <ToggleGroupItem value="comfortable">
                      <Text fontSize="$2">Comfortable</Text>
                    </ToggleGroupItem>
                  </ToggleGroup>
                }
              />
            </Card>
          </YStack>
        ) : null}

        {section === 'terminal' ? (
          <YStack gap="$5" data-testid="desktop-terminal">
            <Heading
              title="Terminal & Editor"
              detail="Configure interactive terminal panes in Tabs and your preferred external code editor."
            />
            <Group title="Terminal">
              <Card>
                <Row
                  first
                  title="Terminal font size"
                  detail="Applied across all Tabs terminal panes (also adjustable with ⌘+ / ⌘-)."
                  trailing={
                    <XStack gap="$2" items="center">
                      <Button size="sm" variant="outline" onPress={() => updateTermFontSize(termFontSize - 1)}>
                        −
                      </Button>
                      <Kbd>{`${termFontSize}px`}</Kbd>
                      <Button size="sm" variant="outline" onPress={() => updateTermFontSize(termFontSize + 1)}>
                        +
                      </Button>
                    </XStack>
                  }
                />
                <Row
                  title="Default login shell"
                  detail="Shell binary launched for local terminal panes on this computer."
                  trailing={
                    <select
                      className="hz-settings-select"
                      aria-label="Default login shell"
                      value={defaultShell}
                      onChange={(e) => {
                        setDefaultShell(e.target.value);
                        writePref('hanzo.terminal.shell', e.target.value);
                      }}
                    >
                      <option value="/bin/zsh">/bin/zsh (default)</option>
                      <option value="/bin/bash">/bin/bash</option>
                      <option value="/opt/homebrew/bin/fish">fish</option>
                      <option value="/bin/sh">/bin/sh</option>
                    </select>
                  }
                />
                <Row
                  title="Cursor style"
                  detail="Visual cursor shape inside terminal panes."
                  trailing={
                    <ToggleGroup
                      type="single"
                      size="sm"
                      variant="outline"
                      disableDeactivation
                      aria-label="Cursor style"
                      value={cursorStyle}
                      onValueChange={(v) => {
                        if (v === 'block' || v === 'bar' || v === 'underline') {
                          setCursorStyle(v);
                          writePref('hanzo.terminal.cursor', v);
                        }
                      }}
                    >
                      <ToggleGroupItem value="block">
                        <Text fontSize="$2">Block</Text>
                      </ToggleGroupItem>
                      <ToggleGroupItem value="bar">
                        <Text fontSize="$2">Bar</Text>
                      </ToggleGroupItem>
                      <ToggleGroupItem value="underline">
                        <Text fontSize="$2">Underline</Text>
                      </ToggleGroupItem>
                    </ToggleGroup>
                  }
                />
              </Card>
            </Group>

            <Group title="Code Editor & File Viewer">
              <Card>
                <Row
                  first
                  title="Preferred external editor"
                  detail="Editor opened when launching a repository or file externally from Dev."
                  trailing={
                    <select
                      className="hz-settings-select"
                      aria-label="Preferred external editor"
                      value={preferredEditor}
                      onChange={(e) => {
                        setPreferredEditor(e.target.value);
                        writePref('hanzo.editor.preferred', e.target.value);
                      }}
                    >
                      <option value="cursor">Cursor</option>
                      <option value="vscode">VS Code</option>
                      <option value="zed">Zed</option>
                      <option value="nvim">Neovim</option>
                      <option value="xcode">Xcode</option>
                    </select>
                  }
                />
                <Row
                  title="Word wrap in file preview"
                  detail="Wrap long lines inside the built-in syntax-highlighted code viewer."
                  trailing={
                    <Switch
                      aria-label="Word wrap in file preview"
                      checked={editorWordWrap}
                      onCheckedChange={(on: boolean) => {
                        setEditorWordWrap(on);
                        writePref('hanzo.editor.wordWrap', String(on));
                      }}
                    />
                  }
                />
              </Card>
            </Group>
          </YStack>
        ) : null}

        {section === 'providers' ? (
          <YStack gap="$5" data-testid="desktop-providers">
            <Heading
              title="Models & Providers"
              detail="Default model & reasoning effort, cloud gateway catalog, detected local coding CLIs, and BYOK API keys."
            />
            <Group title="Model Defaults">
              <Card>
                <Row
                  first
                  title="Default model"
                  detail={
                    cloudModelsCount !== null
                      ? `Used for new chats and runs (${cloudModelsCount} models available on your account).`
                      : 'Used for new chats and runs unless overridden per thread.'
                  }
                  trailing={
                    <select
                      className="hz-settings-select"
                      aria-label="Default model"
                      value={defaultModel}
                      onChange={(e) => {
                        setDefaultModel(e.target.value);
                        writePref('hanzo.chat.defaultModel', e.target.value);
                      }}
                    >
                      <option value="zen6">Zen 6 (Auto)</option>
                      <option value="zen5">Zen 5</option>
                      <option value="zen5-coder">Zen 5 Coder</option>
                      <option value="claude-sonnet-4-6">Claude Sonnet 4.6</option>
                      <option value="claude-opus-4-6">Claude Opus 4.6</option>
                      <option value="gpt-5">GPT-5</option>
                      <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                    </select>
                  }
                />
                <Row
                  title="Default reasoning effort"
                  detail="Controls how deeply reasoning models think before replying."
                  trailing={
                    <ToggleGroup
                      type="single"
                      size="sm"
                      variant="outline"
                      disableDeactivation
                      aria-label="Default reasoning effort"
                      value={reasoningEffort}
                      onValueChange={(v) => {
                        if (typeof v === 'string' && v) {
                          setReasoningEffort(v);
                          writePref('hanzo.chat.effort', v);
                        }
                      }}
                    >
                      {(
                        [
                          ['auto', 'Auto'],
                          ['low', 'Low'],
                          ['medium', 'Med'],
                          ['high', 'High'],
                          ['max', 'Max'],
                        ] as const
                      ).map(([opt, label]) => (
                        <ToggleGroupItem key={opt} value={opt}>
                          <Text fontSize="$2">{label}</Text>
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                  }
                />
                <Row
                  title="Enable third-party models"
                  detail="Show OpenAI, Anthropic, Google, and DeepSeek models alongside Zen & Kai."
                  trailing={
                    <Switch
                      aria-label="Enable third-party models"
                      checked={thirdPartyModels}
                      onCheckedChange={(on: boolean) => {
                        setThirdPartyModels(on);
                        writePref('hanzo.chat.allowThirdPartyModels', String(on));
                      }}
                    />
                  }
                />
              </Card>
            </Group>

            <Group title="Detected Local Tools">
              <Card>
                {detectedTools.length === 0 ? (
                  <Row
                    first
                    title={toolsLoading ? 'Scanning local tools…' : 'No local tools scanned yet'}
                    detail="Discovers hanzo, claude, codex, gemini, opencode, aider, cursor, gh, ollama, and the Hanzo browser extension."
                    trailing={
                      <Button size="sm" variant="outline" onPress={refreshTools}>
                        {toolsLoading ? 'Scanning…' : 'Rescan'}
                      </Button>
                    }
                  />
                ) : (
                  detectedTools.map((tool, i) => (
                    <Row
                      key={tool.id}
                      first={i === 0}
                      title={tool.name}
                      detail={tool.path ? `${tool.detail} · ${tool.path}` : tool.detail}
                      trailing={
                        <XStack gap="$1.5" items="center" shrink={0}>
                          {tool.logged_in ? <Kbd>{tool.category === 'extension' ? 'ZAP linked' : 'Signed in'}</Kbd> : null}
                          <Kbd>{tool.installed || tool.logged_in ? 'Installed' : 'Not found'}</Kbd>
                        </XStack>
                      }
                    />
                  ))
                )}
              </Card>
            </Group>
            <Group title="API Keys & Cloud Providers">
              <ProvidersListSection />
            </Group>
          </YStack>
        ) : null}

        {section === 'agents' ? (
          <YStack gap="$5" data-testid="desktop-agents">
            <Heading
              title="Agents, MCP & Tools"
              detail="Configure agent autonomy, tool permissions, Model Context Protocol (MCP) servers, and local CLI integrations."
            />
            <Group title="Autonomy & Permissions">
              <Card>
                <Row
                  first
                  title="Tool & action approval"
                  detail="Choose whether agents run tools and shell commands automatically or ask before each step."
                  trailing={
                    <ToggleGroup
                      type="single"
                      size="sm"
                      variant="outline"
                      disableDeactivation
                      aria-label="Tool approval mode"
                      value={approvalMode}
                      onValueChange={(v) => {
                        if (v === 'auto' || v === 'manual') {
                          setApprovalMode(v);
                          writePref('hanzo.agent.approvalMode', v);
                        }
                      }}
                    >
                      <ToggleGroupItem value="auto">
                        <Text fontSize="$2">Auto-run</Text>
                      </ToggleGroupItem>
                      <ToggleGroupItem value="manual">
                        <Text fontSize="$2">Ask first</Text>
                      </ToggleGroupItem>
                    </ToggleGroup>
                  }
                />
                <Row
                  title="Shell & terminal execution"
                  detail="Allow coding agents to run builds, tests, and git commands inside project workspaces."
                  trailing={
                    <Switch
                      aria-label="Shell and terminal execution"
                      checked={shellExecEnabled}
                      onCheckedChange={(on: boolean) => {
                        setShellExecEnabled(on);
                        writePref('hanzo.tools.shellExec', String(on));
                      }}
                    />
                  }
                />
                <Row
                  title="Live web search & fetch"
                  detail="Allow agents to query search APIs and read online documentation."
                  trailing={
                    <Switch
                      aria-label="Live web search and fetch"
                      checked={webSearchEnabled}
                      onCheckedChange={(on: boolean) => {
                        setWebSearchEnabled(on);
                        writePref('hanzo.tools.webSearch', String(on));
                      }}
                    />
                  }
                />
                <Row
                  title="MCP Protocol bridge"
                  detail="Expose local MCP tools and connected ZAP servers to agents."
                  trailing={
                    <Switch
                      aria-label="MCP Protocol bridge"
                      checked={mcpEnabled}
                      onCheckedChange={(on: boolean) => {
                        setMcpEnabled(on);
                        writePref('hanzo.mcp.enabled', String(on));
                      }}
                    />
                  }
                />
              </Card>
            </Group>

            <Group title="CLI Agents & MCP Peers">
              <Card>
                <Row
                  first
                  title={`Detected local coding CLIs (${detectedTools.filter((t) => t.installed).length})`}
                  detail="Hanzo, Claude Code, Codex, Gemini CLI, OpenCode, Aider, and GitHub CLI."
                  trailing={
                    <Button size="sm" variant="outline" onPress={refreshTools}>
                      {toolsLoading ? 'Scanning…' : 'Rescan'}
                    </Button>
                  }
                />
                <Row
                  title={`Connected ZAP / MCP nodes (${zapNodes.length})`}
                  detail="Native zero-copy tool peers bridged over hanzo-mcp and the Hanzo browser extension."
                  trailing={
                    <Button size="sm" variant="outline" onPress={() => pick('zap')}>
                      Inspect ZAP
                    </Button>
                  }
                />
              </Card>
            </Group>
          </YStack>
        ) : null}

        {section === 'shortcuts' ? (
          <YStack gap="$5" data-testid="desktop-shortcuts">
            <Heading
              title="Keyboard shortcuts"
              detail={platform === 'mac' ? 'As they work on this Mac.' : 'As they work on Windows and Linux.'}
            />
            {shortcutGroups(platform).map((g) => (
              <Group key={g.title} title={g.title}>
                <Card>
                  {g.rows.map((r, i) => (
                    <Row
                      key={r.does}
                      first={i === 0}
                      title={r.does}
                      trailing={
                        <XStack gap="$1.5" items="center" shrink={0}>
                          {r.keys.map((k) => (
                            <Kbd key={k}>{k}</Kbd>
                          ))}
                        </XStack>
                      }
                    />
                  ))}
                </Card>
              </Group>
            ))}
          </YStack>
        ) : null}

        {section === 'local-models' ? (
          <YStack gap="$5" data-testid="desktop-local-models">
            <Heading
              title="Local models"
              detail="Models that run on this computer. Chats they answer do not leave it."
            />
            <Card>
              <Row
                first
                title={status.label}
                detail={status.detail}
                trailing={
                  <Button size="sm" variant="outline" onPress={() => openLocalAiManager('models')}>
                    Manage local models
                  </Button>
                }
              />
            </Card>
            {hardware ? (
              <Group title="Hardware Capabilities">
                <Card>
                  <Row
                    first
                    title={hardware.cpu_model || 'Local Processor'}
                    detail={[
                      hardware.cpu_cores ? `${hardware.cpu_cores} cores` : null,
                      hardware.total_memory_gb ? `${hardware.total_memory_gb} GB RAM` : null,
                      hardware.gpu_name ? `GPU: ${hardware.gpu_name}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'Detected local compute hardware.'}
                    trailing={<Kbd>Local</Kbd>}
                  />
                </Card>
              </Group>
            ) : null}
          </YStack>
        ) : null}

        {section === 'environments' ? (
          <YStack gap="$5" data-testid="desktop-environments">
            <Heading
              title="Environments & Linked Machines"
              detail="Manage this computer's local Hanzo Dev runtime, linked Macs/Linux hosts, and remote control."
            />
            <Group title="This Computer">
              <Card>
                <Row
                  first
                  title={localDev?.hostname || 'This computer'}
                  detail={
                    localDev
                      ? `Hanzo Dev runtime active at ${localDev.origin.replace(/^https?:\/\//, '')} (id: ${localDev.id}).`
                      : 'Local Hanzo Dev runtime is offline or starting.'
                  }
                  trailing={
                    <XStack gap="$2" items="center">
                      <Kbd>{localDev ? 'Online' : 'Offline'}</Kbd>
                      <Button size="sm" variant="outline" onPress={refreshEnvironments}>
                        {machinesLoading ? 'Checking…' : 'Refresh'}
                      </Button>
                    </XStack>
                  }
                />
                <Row
                  title="Remote Control & Hanzo Link"
                  detail="Run `hanzo link` on any Mac, Linux workstation, or server to connect its terminal and Dev runtime to your account."
                  trailing={
                    <Button
                      size="sm"
                      variant="outline"
                      onPress={() => {
                        onBack();
                        window.history.pushState(null, '', '/tabs');
                      }}
                    >
                      Open Tabs
                    </Button>
                  }
                />
              </Card>
            </Group>

            <Group title={`Linked Machines (${machines.length})`}>
              <Card>
                {machines.length === 0 ? (
                  <Row
                    first
                    title={machinesLoading ? 'Discovering linked machines…' : 'No remote machines linked yet'}
                    detail="Sign in on another computer or run `hanzo link` in a terminal to pair it for remote control."
                    trailing={
                      <Button size="sm" variant="outline" onPress={refreshEnvironments}>
                        Rescan
                      </Button>
                    }
                  />
                ) : (
                  machines.map((m, i) => (
                    <Row
                      key={m.id ?? m.name ?? String(i)}
                      first={i === 0}
                      title={m.name || m.hostname || m.id || 'Linked Machine'}
                      detail={[m.hostname, m.kind].filter(Boolean).join(' · ') || 'Paired via Hanzo Link'}
                      trailing={<Kbd>{m.status === 'online' ? 'Online' : m.status || 'Linked'}</Kbd>}
                    />
                  ))
                )}
              </Card>
            </Group>

            <Group title="Mobile & Web Sync">
              <Card>
                <Row
                  first
                  title="Hanzo Mobile & Web"
                  detail="Sign in with the same Hanzo account on iOS, Android, and hanzo.app to control this computer remotely."
                  trailing={
                    <XStack gap="$2">
                      <Button size="sm" variant="outline" onPress={() => void openUrl(`${siteUrl}/download`)}>
                        Get Mobile
                      </Button>
                      <Button size="sm" variant="outline" onPress={() => void openUrl('https://hanzo.app')}>
                        Open hanzo.app
                      </Button>
                    </XStack>
                  }
                />
              </Card>
            </Group>
          </YStack>
        ) : null}

        {section === 'zap' ? (
          <YStack gap="$5" data-testid="desktop-zap">
            <Heading
              title="ZAP & Extensions"
              detail="Native Zero-Copy Agent Protocol (zap-proto.io) router connecting browsers, CLIs, MCP tools, and linked machines."
            />
            <Group title="Connected ZAP Nodes">
              <Card>
                {zapNodes.length === 0 ? (
                  <Row
                    first
                    title={zapLoading ? 'Scanning ZAP router…' : 'No external ZAP peers connected'}
                    detail="Open Chrome, Firefox, or Safari with the Hanzo Browser Extension or run hanzo-mcp."
                    trailing={
                      <XStack gap="$2">
                        <Button size="sm" variant="outline" onPress={refreshZap}>
                          Refresh
                        </Button>
                        <Button size="sm" variant="outline" onPress={() => void openUrl(`${siteUrl}/download`)}>
                          Get Extension
                        </Button>
                      </XStack>
                    }
                  />
                ) : (
                  zapNodes.map((node, i) => (
                    <Row
                      key={node.id ?? node.url ?? String(i)}
                      first={i === 0}
                      title={node.name || node.id || 'ZAP Node'}
                      detail={[node.protocol || 'zap', node.url, node.kind].filter(Boolean).join(' · ') || 'Connected peer'}
                      trailing={<Kbd>{node.status !== 'offline' ? 'Online' : 'Offline'}</Kbd>}
                    />
                  ))
                )}
              </Card>
            </Group>
          </YStack>
        ) : null}

        {section === 'advanced' ? (
          <YStack gap="$5" data-testid="desktop-advanced">
            <Heading title="Advanced" detail="For developers and for diagnosing problems." />
            <YStack data-testid="desktop-dev-mode">
              <Card>
                <Row
                  first
                  title="Developer mode"
                  detail={DEV_MODE_NOTE}
                  trailing={
                    <Switch
                      aria-label="Developer mode"
                      data-testid="desktop-dev-mode-switch"
                      checked={devMode}
                      onCheckedChange={(on: boolean) => setDevMode(on)}
                    />
                  }
                />
              </Card>
            </YStack>
            {mining !== null && (
              <Card>
                <Row
                  first
                  title="Earn rewards by sharing this computer's power"
                  detail={`While on, ${getBrand().name} uses this computer's processor in the background, once a minute, to make work proofs for its network; rewards are counted on this computer and are not paid out yet.`}
                  trailing={
                    <Switch
                      aria-label="Earn rewards by sharing this computer's power"
                      data-testid="desktop-mining-switch"
                      checked={mining}
                      onCheckedChange={turnMining}
                    />
                  }
                />
              </Card>
            )}
            <Group title="Local services">
              <Card>
                <Row
                  first
                  mono
                  title={`Hanzo Engine  ${LOCAL_ENGINE_URL}`}
                  detail={`OpenAI-compatible inference server: ${say(engineUp)} on /health.`}
                  trailing={
                    <Button size="sm" variant="outline" onPress={() => openLocalAiManager('engine')}>
                      Engine settings
                    </Button>
                  }
                />
                <Row
                  mono
                  title={`hanzod  ${HANZOD_DAEMON_URL}`}
                  detail={`Unified Rust daemon (local Dev + inference + ZAP): ${say(hanzodDaemonUp)} on /v1/hanzod.`}
                  trailing={
                    <Button size="sm" variant="outline" onPress={() => openLocalAiManager('node')}>
                      Node settings
                    </Button>
                  }
                />
                <Row
                  mono
                  title={`hanzod chain  ${HANZOD_URL}`}
                  detail={`Per-machine blockchain validator (HIP-1330), JSON-RPC eth_blockNumber: ${say(hanzodUp)}.`}
                  trailing={
                    <Button size="sm" variant="outline" onPress={() => openLocalAiManager('node')}>
                      Chain RPC
                    </Button>
                  }
                />
              </Card>
            </Group>
          </YStack>
        ) : null}
      </Settings>
    </YStack>
  );
}
