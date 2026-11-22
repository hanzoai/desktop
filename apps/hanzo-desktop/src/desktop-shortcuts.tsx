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
  // The cloud is the brand's; the engine below is Hanzo's under every brand.
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

/**
 * The window's own keys, past the ones @hanzo/app answers (its keys.js: ⌘K,
 * ⌘⇧O, ⌘B, ⌘, and the rest): ⌘N opens a new chat, as File ▸ New does in a
 * desktop app, and ⌘⇧M turns the composer's microphone on and off. Ctrl on
 * Windows and Linux. A press something already answered, a repeat, or one
 * still composing a character is not a command.
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

const SECTIONS = [
  { id: 'appearance', label: 'Appearance', group: 'Hanzo Desktop' },
  { id: 'providers', label: 'Providers & Tools', group: 'Hanzo Desktop' },
  { id: 'shortcuts', label: 'Keyboard shortcuts', group: 'Hanzo Desktop' },
  { id: 'local-models', label: 'Local models', group: 'Hanzo Desktop' },
  { id: 'zap', label: 'ZAP & Extensions', group: 'Hanzo Desktop' },
  { id: 'account', label: 'Account', group: 'Hanzo Desktop' },
  { id: 'advanced', label: 'Advanced', group: 'Hanzo Desktop' },
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

/**
 * The section an address names (`/settings/advanced`). Any other settings address,
 * bare `/settings` included, is the app's Profile, Personalization or Account, which
 * the Account section answers (the pages themselves are hanzo.ai's).
 */
export const sectionOf = (path: string): Section =>
  SECTIONS.find((s) => path === `/settings/${s.id}`)?.id ?? 'account';

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

/**
 * The window's own Settings: what is this computer's to decide. The account's
 * own settings (billing, members, keys) are hanzo.ai's; this page links there.
 * Drawn from @hanzo/ui's settings kit, so it reads as the app's other settings
 * in either theme; addresses and ports are Advanced's alone.
 */
export function DesktopSettings({
  isAuthenticated,
  siteUrl = 'https://hanzo.ai',
  barInset = 0,
  onSignIn,
  onBack,
}: {
  isAuthenticated: boolean;
  siteUrl?: string;
  barInset?: number;
  onSignIn: () => void;
  onBack: () => void;
}) {
  const platform = platformOf(navigator.userAgent);
  const [section, setSection] = useState<Section>(() => sectionOf(window.location.pathname));
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
  const [sidebarStyle, setSidebarStyle] = useState<SidebarStylePref>(() => {
    try {
      return window.localStorage.getItem('hanzo.sidebar.style') === 'nested' ? 'nested' : 'flat';
    } catch {
      return 'flat';
    }
  });
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
  const [count, setCount] = useState<number | null>(null);
  const [engineInstalled, setEngineInstalled] = useState<boolean | null>(null);
  const [serving, setServing] = useState<string | null>(null);
  const [detectedTools, setDetectedTools] = useState<DetectedToolRow[]>([]);
  const [toolsLoading, setToolsLoading] = useState(false);
  const [zapNodes, setZapNodes] = useState<ZapNodeRow[]>([]);
  const [zapLoading, setZapLoading] = useState(false);

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

  useEffect(() => {
    if (section === 'providers') refreshTools();
    if (section === 'zap') refreshZap();
  }, [section, refreshTools, refreshZap]);

  // Back is Escape, or the window's own Back (⌘[ on a Mac, Alt+← elsewhere).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
          // What this app serves, by name: /health would also answer for someone else's server.
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
    try {
      window.localStorage.setItem('hanzo.sidebar.style', next);
      window.dispatchEvent(new CustomEvent('hanzo:sidebar-style', { detail: next }));
    } catch {}
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
            </Card>
          </YStack>
        ) : null}

        {section === 'providers' ? (
          <YStack gap="$5" data-testid="desktop-providers">
            <Heading
              title="Providers & Tools"
              detail="Auto-detected local AI coding tools, logged-in accounts, ZAP browser extension, and provider API keys."
            />
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

        {section === 'account' ? (
          <YStack gap="$5" data-testid="desktop-account">
            <Heading title="Account" />
            <Card>
              {isAuthenticated ? (
                <Row
                  first
                  title="Signed in"
                  detail={`Your profile, personalization, organization, billing, usage and API keys are on ${new URL(siteUrl).host}, in your browser.`}
                  trailing={
                    <Button size="sm" variant="outline" onPress={() => void openUrl(`${siteUrl}/settings`)}>
                      {`Open on ${new URL(siteUrl).host}`}
                    </Button>
                  }
                />
              ) : (
                <Row
                  first
                  title="Not signed in"
                  detail="Sign in for cloud models and to keep your chats on every device."
                  trailing={
                    <Button size="sm" variant="primary" onPress={onSignIn}>
                      Sign in
                    </Button>
                  }
                />
              )}
            </Card>
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
