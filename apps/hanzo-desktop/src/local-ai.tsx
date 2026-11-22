import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { getBrand } from '@hanzo/desktop-brand-config';
import { XStack, YStack } from '@hanzo/gui';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  Badge,
  Button,
  Input,
  Progress,
  Text,
} from '@hanzo/ui';

import {
  CANCELLED,
  ENGINE_RELEASES_URL,
  LOCAL_ENGINE_URL,
  LOCAL_SOURCES,
  type EngineStatus,
  type LocalSource,
  cancelPull,
  engineStatus,
  fitsThisMac,
  formatSize,
  memoryGb,
  memoryNeededGb,
  overall,
  pullModel,
  reason,
  removeModel,
  serveModel,
  sourceForRepo,
  sourceForTag,
  stopModel,
  waitForEngine,
} from './lib/local-models';
import { keychain } from './keychain';
import { isTauriAvailable as isTauri } from './utils/tauri-check';

const MIND_STORAGE_KEY = 'hanzo.mind';
const MIND_CHANGE_EVENT = 'hanzo:mind';

function kept(): { model: string; effort: string } {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(MIND_STORAGE_KEY) : null;
    const parsed = raw ? (JSON.parse(raw) as { model?: string; effort?: string }) : null;
    return {
      model: typeof parsed?.model === 'string' && parsed.model.trim() ? parsed.model : 'enso',
      effort: typeof parsed?.effort === 'string' && parsed.effort.trim() ? parsed.effort : 'auto',
    };
  } catch {
    return { model: 'enso', effort: 'auto' };
  }
}

function keep(patch: { model?: string; effort?: string }): void {
  const current = kept();
  const next = {
    model: patch.model ?? current.model,
    effort: patch.effort ?? current.effort,
  };
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(MIND_STORAGE_KEY, JSON.stringify(next));
    }
  } catch {
    // ignore storage errors
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(MIND_CHANGE_EVENT));
  }
}

export const OPEN_LOCAL_AI_EVENT = 'hanzo:open-local-ai';
export const LOCAL_MODELS_UPDATED_EVENT = 'hanzo:local-models-updated';
const CUSTOM_ENGINE_STORAGE_KEY = 'hanzo:local:engine-url';

export interface InstalledModelInfo {
  id: string;
  sizeBytes?: number;
  source: 'hanzo-engine' | 'custom';
}

export interface DiscoveredEngine {
  name: string;
  host: string;
  ip: string;
  port: number;
  models: string[];
  version?: string | null;
  latency_ms?: number | null;
  base_url: string;
}

export function getCustomEngineUrl(): string {
  try {
    return window.localStorage.getItem(CUSTOM_ENGINE_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function setCustomEngineUrl(url: string): void {
  try {
    if (url.trim()) {
      window.localStorage.setItem(CUSTOM_ENGINE_STORAGE_KEY, url.trim().replace(/\/+$/, ''));
    } else {
      window.localStorage.removeItem(CUSTOM_ENGINE_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

const isTestEnv = () =>
  typeof import.meta !== 'undefined' && (import.meta as { env?: { MODE?: string } }).env?.MODE === 'test';

/** The model ids an OpenAI-compatible server at `base` (ending in /v1) answers with. */
async function servedIds(base: string, fetchImpl: typeof fetch = fetch): Promise<string[]> {
  try {
    const res = await fetchImpl(`${base}/models`, { signal: AbortSignal.timeout(isTestEnv() ? 150 : 1200) });
    if (!res.ok) return [];
    const body = await res.json();
    return Array.isArray(body?.data) ? body.data.map((r: { id?: unknown }) => String(r?.id ?? '')).filter(Boolean) : [];
  } catch {
    return [];
  }
}

const customBase = (url: string) => (url.endsWith('/v1') ? url : `${url}/v1`);

let cachedInstalledModels: InstalledModelInfo[] = [];
let lastProbeAt = 0;

/** Downloaded models (by catalogue tag), plus what a custom endpoint serves. */
export async function probeInstalledLocalModels(force = false): Promise<InstalledModelInfo[]> {
  if (!force && Date.now() - lastProbeAt < 3000 && cachedInstalledModels.length > 0) {
    return cachedInstalledModels;
  }
  const customUrl = getCustomEngineUrl();
  const [status, customRows] = await Promise.all([
    engineStatus().catch(() => null),
    customUrl ? servedIds(customBase(customUrl)) : Promise.resolve([]),
  ]);
  const found: InstalledModelInfo[] = [];
  const seen = new Set<string>();
  const add = (row: InstalledModelInfo) => {
    if (!seen.has(row.id)) {
      seen.add(row.id);
      found.push(row);
    }
  };
  customRows.forEach((id) => add({ id, source: 'custom' }));
  for (const m of status?.installed ?? []) {
    add({ id: sourceForRepo(m.repo)?.tag ?? m.repo, sizeBytes: m.bytes, source: 'hanzo-engine' });
  }
  cachedInstalledModels = found;
  lastProbeAt = Date.now();
  return found;
}

/**
 * Builds the OpenAI-compatible `/v1/models` list for local / signed-out mode:
 * the router aliases, what is installed, then every model this app can download
 * (local-sources.json), so the composer's picker offers nothing it cannot fetch.
 */
/** What the picker may say a model can do: only what local-sources.json says, and no model here sees images. */
function abilities(tag: string) {
  const src = sourceForTag(tag);
  return { supports_vision: false, supports_tools: src?.tools ?? false, supports_reasoning: src?.reasons ?? false };
}

export async function buildLocalModelsCatalogResponse(): Promise<{ object: 'list'; data: Array<Record<string, unknown>> }> {
  const installed = await probeInstalledLocalModels();
  const data: Array<Record<string, unknown>> = [];
  const added = new Set<string>();

  const pushModel = (entry: Record<string, unknown>) => {
    const id = String(entry.id || '');
    if (!id || added.has(id)) return;
    added.add(id);
    data.push(entry);
  };

  // First: add default router aliases so `enso-free` and `enso` always resolve cleanly
  const firstInstalledChat = installed.find(
    (m) => !m.id.includes('embed') && !m.id.includes('minilm') && m.id !== 'default',
  );
  const activeLabel = firstInstalledChat
    ? `Local AI (${firstInstalledChat.id})`
    : 'Zen Nano 0.6B (Local AI)';

  for (const routerId of ['enso-auto', 'enso-free', 'enso']) {
    pushModel({
      id: routerId,
      name: activeLabel,
      description: 'The model you chose on this computer.',
      object: 'model',
      created: 1793775303,
      owned_by: 'hanzo-local',
      family: 'enso',
      class: 'free',
      context_window: 131072,
      // The alias answers with the model chosen on this computer (localChat).
      ...abilities(kept().model),
    });
  }

  // Second: any currently installed local models right at the top
  for (const inst of installed) {
    if (inst.id === 'default' || inst.id.includes('embed') || inst.id.includes('minilm')) continue;
    const isZen = inst.id.toLowerCase().startsWith('zen');
    pushModel({
      id: inst.id,
      name: `${sourceForTag(inst.id)?.title ?? inst.id} (Local · Installed)`,
      description: inst.source === 'custom' ? 'Served by your own endpoint' : 'Downloaded to this computer',
      object: 'model',
      created: 1793775303,
      owned_by: isZen ? 'zenlm' : 'local',
      ...(isZen ? { family: 'zen' } : {}),
      class: 'free',
      context_window: 131072,
      // A custom endpoint's model is not in the list, so nothing is claimed for it.
      ...abilities(inst.id),
    });
  }

  // Third: every model the app can download, by its catalogue tag.
  for (const src of LOCAL_SOURCES) {
    pushModel({
      id: src.tag,
      name: `${src.title} (Local · ${formatSize(src.bytes)})`,
      description: src.blurb,
      object: 'model',
      created: 1793775303,
      owned_by: src.repo.split('/')[0],
      ...(src.tag.startsWith('zen') ? { family: 'zen' } : {}),
      class: 'free',
      context_window: 131072,
      ...abilities(src.tag),
    });
  }

  return { object: 'list', data };
}

const ROUTER_ALIASES = new Set(['enso', 'enso-free', 'enso-auto', 'zen6-free', 'zen-free', 'free', 'default']);

/** What an engine that refused a turn said, with its status: its own words, never ours. */
async function refusal(res: Response): Promise<Error> {
  const body = await res.json().catch(() => null);
  const said = body?.error?.message ?? body?.error ?? body?.detail;
  return new Error(`${typeof said === 'string' && said ? said : 'The local engine refused the turn.'} (${res.status})`);
}

const textOf = (body: any): string => String(body?.choices?.[0]?.message?.content ?? '');

/**
 * `configure({ local }).chat`: the app's signed-out turn, answered on this computer: by a custom
 * endpoint when one is set, otherwise by the model Hanzo's engine serves (LOCAL_ENGINE_URL). A
 * downloaded model that is not running yet is started for the turn (the person picked it). Anything
 * that cannot answer is a thrown error carrying the reason (the engine's own words when it gave
 * them); the failed turn shows it, and its "Open settings" button reaches Settings on Local models
 * (`hanzo:anon-settings`, host.tsx). Stop is `signal`.
 */
export async function localChat(
  turn: { messages: unknown[]; model?: string; signal: AbortSignal },
  nativeFetch: typeof window.fetch = window.fetch.bind(window),
): Promise<string> {
  const requestedModel = (turn.model || 'enso-free').trim();
  const payload = { model: requestedModel, messages: turn.messages };

  const customUrl = getCustomEngineUrl();
  if (customUrl) {
    try {
      const res = await nativeFetch(`${customBase(customUrl)}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: turn.signal,
      });
      if (res.ok) return textOf(await res.json());
      throw await refusal(res);
    } catch (e) {
      // An unreachable custom endpoint falls through to this computer's engine; one that
      // answered and refused, or a Stop, is the turn's answer.
      if (turn.signal.aborted || !(e instanceof TypeError)) throw e;
    }
  }

  const status = await engineStatus().catch(() => null);
  const installedRepos = new Set(status?.installed.map((m) => m.repo) ?? []);
  const asked = ROUTER_ALIASES.has(requestedModel) ? kept().model : requestedModel;
  const askedSource = sourceForTag(asked);
  if (!ROUTER_ALIASES.has(requestedModel) && !(askedSource && installedRepos.has(askedSource.repo)) && status) {
    throw new Error(`${askedSource?.title ?? requestedModel} is not downloaded yet. Download it in Settings, or pick a downloaded model.`);
  }

  // Outside the app (a plain browser) nothing can say who serves the port, so
  // whatever answers there is used; in the app, only the model it started.
  let ours = !status;
  if (status?.engine) {
    const want =
      askedSource && installedRepos.has(askedSource.repo) ? askedSource.repo : status.installed[0]?.repo ?? null;
    if (want) {
      try {
        if (status.serving !== want) await serveModel(want);
        ours = await waitForEngine(want);
      } catch {
        // said below: nothing answers
      }
    }
  }

  const served = ours ? await servedIds(`${LOCAL_ENGINE_URL}/v1`, nativeFetch) : [];
  if (served.length > 0) {
    const res = await nativeFetch(`${LOCAL_ENGINE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, model: served[0] }),
      signal: turn.signal,
    });
    if (!res.ok) throw await refusal(res);
    return textOf(await res.json());
  }

  throw new Error(
    status && !status.engine
      ? 'Local models are not set up: Hanzo’s engine is not installed on this computer. Settings shows how to get it.'
      : 'No local model is running yet. Download one in Settings, then choose Use.',
  );
}

export function openLocalAiManager(
  detail?: 'models' | 'node' | 'engine' | { tab?: 'models' | 'node' | 'engine' },
) {
  const normalized = typeof detail === 'string' ? { tab: detail } : detail;
  window.dispatchEvent(new CustomEvent(OPEN_LOCAL_AI_EVENT, { detail: normalized }));
}

/** Memory to judge "fits" against when the app cannot read it (a plain browser). */
const ASSUMED_RAM_GB = 8;

function openOutside(url: string) {
  if (isTauri()) void openUrl(url).catch(() => undefined);
  else window.open(url, '_blank', 'noopener');
}

export function LocalAiManager() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<EngineStatus | null>(null);
  const [checked, setChecked] = useState(false);
  const [ram, setRam] = useState<number | null>(null);
  // The model Remove was pressed on, while the person is asked to confirm.
  const [removing, setRemoving] = useState<LocalSource | null>(null);
  const [selected, setSelected] = useState<string>(() => kept().model);
  const [percent, setPercent] = useState<Record<string, number>>({});
  const [starting, setStarting] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [advanced, setAdvanced] = useState(false);
  const [customUrl, setCustomUrl] = useState<string>(() => getCustomEngineUrl());
  const [customNote, setCustomNote] = useState('');
  const [lanEngines, setLanEngines] = useState<DiscoveredEngine[]>([]);
  const [scanning, setScanning] = useState(false);
  const [lanMessage, setLanMessage] = useState('');
  const panel = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const next = await engineStatus().catch(() => null);
    setStatus(next);
    setSelected(kept().model);
    setChecked(true);
  }, []);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ tab?: 'models' | 'node' | 'engine' }>).detail;
      if (detail?.tab === 'node' || detail?.tab === 'engine') setAdvanced(true);
      setOpen(true);
      void refresh();
      void memoryGb().then(setRam);
    };
    window.addEventListener(OPEN_LOCAL_AI_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_LOCAL_AI_EVENT, onOpen);
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      // Escape with the Remove question open closes only the question.
      if (e.key === 'Escape' && !removing) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, removing]);

  const installedRepos = useMemo(() => new Set(status?.installed.map((m) => m.repo) ?? []), [status]);
  const downloading = Object.keys(percent)[0] ?? null;
  const ramGb = ram ?? ASSUMED_RAM_GB;

  const setError = (tag: string, message: string | null) =>
    setErrors((all) => {
      const next = { ...all };
      if (message) next[tag] = message;
      else delete next[tag];
      return next;
    });

  const download = async (src: LocalSource) => {
    setError(src.tag, null);
    setPercent({ [src.tag]: 0 });
    try {
      await pullModel(src.repo, (p) => setPercent({ [src.tag]: p }));
    } catch (err) {
      const why = reason(err);
      if (why !== CANCELLED) setError(src.tag, why);
    } finally {
      setPercent({});
      await refresh();
      window.dispatchEvent(new Event(LOCAL_MODELS_UPDATED_EVENT));
    }
  };

  const use = async (src: LocalSource) => {
    keep({ model: src.tag });
    setSelected(src.tag);
    window.dispatchEvent(new Event(LOCAL_MODELS_UPDATED_EVENT));
    setError(src.tag, null);
    if (!status?.engine) {
      setError(src.tag, 'Chosen. It will run once Hanzo’s engine is installed on this computer.');
      return;
    }
    setStarting(src.tag);
    try {
      await serveModel(src.repo);
      if (!(await waitForEngine(src.repo))) {
        const after = await engineStatus().catch(() => null);
        const said = after?.serve_error?.split('\n').filter(Boolean).pop();
        setError(src.tag, `${src.title} did not start${said ? `: ${said}` : '.'}`);
      }
    } catch (err) {
      setError(src.tag, reason(err));
    } finally {
      setStarting(null);
      await refresh();
    }
  };

  const remove = async (src: LocalSource) => {
    setError(src.tag, null);
    try {
      await removeModel(src.repo);
    } catch (err) {
      setError(src.tag, reason(err));
    }
    await refresh();
    window.dispatchEvent(new Event(LOCAL_MODELS_UPDATED_EVENT));
  };

  const stop = async () => {
    await stopModel().catch(() => undefined);
    await refresh();
  };

  const scanLan = async () => {
    if (!isTauri()) return;
    setScanning(true);
    setLanMessage('');
    try {
      const found = await invoke<DiscoveredEngine[]>('engines_discover');
      const engines = Array.isArray(found) ? found : [];
      setLanEngines(engines);
      if (engines.length === 0) setLanMessage('No model servers found on this network.');
    } catch (err) {
      setLanEngines([]);
      setLanMessage(`The search failed: ${reason(err)}`);
    } finally {
      setScanning(false);
    }
  };

  const saveCustom = (url: string) => {
    setCustomUrl(url);
    setCustomEngineUrl(url);
    setCustomNote(url.trim() ? `Chat will use ${url.trim()} first.` : 'Chat uses this computer’s engine again.');
  };

  if (!open) return null;

  const state = overall(checked ? status : null);
  const recommended = LOCAL_SOURCES.filter((s) => fitsThisMac(s.bytes, ramGb));
  const firstInstalled = LOCAL_SOURCES.find((s) => installedRepos.has(s.repo));
  const chosen = sourceForTag(selected);
  const nextUse = chosen && installedRepos.has(chosen.repo) ? chosen : firstInstalled;
  const starter = LOCAL_SOURCES[0];

  const card = (src: LocalSource) => {
    const installed = installedRepos.has(src.repo);
    const running = status?.serving === src.repo;
    const pct = percent[src.tag];
    const busy = pct !== undefined;
    // No fit claim when the memory could not be read: 8 GB is only a guess.
    const fits = ram !== null && fitsThisMac(src.bytes, ram);
    const err = errors[src.tag];
    return (
      <YStack
        key={src.tag}
        data-testid={`local-ai-model-${src.tag}`}
        gap="$2"
        p="$3"
        rounded="$4"
        borderWidth={1}
        borderColor={running ? '$color8' : '$borderColor'}
        bg="$color2"
      >
        <XStack items="center" justify="space-between" gap="$3" flexWrap="wrap">
          <YStack gap="$1" flex={1} minW={200}>
            <XStack items="center" gap="$2" flexWrap="wrap">
              <Text fontSize="$4" fontWeight="600" color="$color">
                {src.title}
              </Text>
              <Badge variant={fits ? 'secondary' : 'outline'} size="sm">
                {fits ? 'Fits this computer' : `Needs ${memoryNeededGb(src.bytes)} GB memory`}
              </Badge>
              {installed && (
                <Badge variant="outline" size="sm">
                  Downloaded
                </Badge>
              )}
            </XStack>
            <Text fontSize="$2" color="$color11">
              {src.blurb} {formatSize(src.bytes)} download.
            </Text>
          </YStack>
          <XStack gap="$2" items="center">
            {busy ? (
              <>
                <Text fontSize="$2" color="$color11" aria-live="polite">
                  Downloading {pct}%
                </Text>
                <Button size="sm" variant="outline" onPress={() => void cancelPull()} aria-label={`Cancel downloading ${src.title}`}>
                  Cancel
                </Button>
              </>
            ) : installed ? (
              <>
                {running ? (
                  <Button size="sm" variant="secondary" disabled aria-label={`${src.title} is in use`}>
                    In use
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={starting !== null}
                    onPress={() => void use(src)}
                    aria-label={`Use ${src.title}`}
                  >
                    {starting === src.tag ? 'Starting…' : 'Use'}
                  </Button>
                )}
                <Button size="sm" variant="ghost" onPress={() => setRemoving(src)} aria-label={`Remove ${src.title}`}>
                  Remove
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant={fits ? 'primary' : 'outline'}
                disabled={downloading !== null || !status}
                onPress={() => void download(src)}
                aria-label={`Download ${src.title}`}
              >
                Download
              </Button>
            )}
          </XStack>
        </XStack>
        {busy && <Progress value={pct} size="sm" aria-label={`${src.title} download progress`} />}
        {err && (
          <XStack items="center" justify="space-between" gap="$2" flexWrap="wrap">
            <Text role="alert" data-testid="local-ai-pull-error" fontSize="$2" color="$red10" flex={1}>
              {err}
            </Text>
            {!installed && !busy && status && (
              <Button size="xs" variant="outline" onPress={() => void download(src)} aria-label={`Try downloading ${src.title} again`}>
                Try again
              </Button>
            )}
          </XStack>
        )}
      </YStack>
    );
  };

  const header = (() => {
    if (!checked) return { title: 'Checking this computer…', body: '', action: null as ReactNode };
    const fetching = downloading ? sourceForTag(downloading) : undefined;
    if (fetching && state.kind !== 'running') {
      return {
        title: `Downloading ${fetching.title}… ${percent[fetching.tag]}%`,
        body: `You can keep using ${getBrand().name} while it downloads.`,
        action: null,
      };
    }
    switch (state.kind) {
      case 'app-only':
        return {
          title: 'Local models are not set up',
          body: `Models run on your computer only in the ${getBrand().name} desktop app. Open this screen there to download one.`,
          action: null,
        };
      case 'no-engine':
        return {
          title: 'Local models are not set up',
          body: `Hanzo’s engine, which runs models on this computer, is not installed. You can download models now; they run once the engine is installed.`,
          action: (
            <XStack gap="$2" flexWrap="wrap">
              <Button size="sm" variant="primary" onPress={() => openOutside(ENGINE_RELEASES_URL)}>
                Get Hanzo’s engine
              </Button>
              <Button size="sm" variant="ghost" onPress={() => void refresh()}>
                Check again
              </Button>
            </XStack>
          ),
        };
      case 'running': {
        const src = sourceForRepo(state.repo);
        return {
          title: `Running ${src?.title ?? state.repo}`,
          body: 'Chat answers on this computer, without the internet.',
          action: (
            <Button size="sm" variant="outline" onPress={() => void stop()}>
              Stop
            </Button>
          ),
        };
      }
      case 'ready':
        return state.installed === 0
          ? {
              title: 'Ready',
              body: `Nothing downloaded yet. ${starter.title} is a good first model (${formatSize(starter.bytes)}).`,
              action: percent[starter.tag] === undefined && (
                <Button size="sm" variant="primary" disabled={downloading !== null} onPress={() => void download(starter)}>
                  {`Download ${starter.title}`}
                </Button>
              ),
            }
          : {
              title: 'Ready',
              body: `${state.installed} ${state.installed === 1 ? 'model' : 'models'} downloaded. Choose one to chat without the internet.`,
              action: nextUse ? (
                <Button size="sm" variant="primary" disabled={starting !== null} onPress={() => void use(nextUse)}>
                  {starting === nextUse.tag ? 'Starting…' : `Use ${nextUse.title}`}
                </Button>
              ) : null,
            };
    }
  })();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="local-ai-title"
      data-slot="local-ai-modal"
      data-testid="local-ai-manager-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.72)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <YStack
        ref={panel as never}
        tabIndex={-1}
        width="100%"
        maxW={760}
        maxH="88vh"
        bg="$background"
        borderWidth={1}
        borderColor="$borderColor"
        rounded="$6"
        overflow="hidden"
      >
        <XStack items="center" justify="space-between" gap="$3" px="$4" py="$3" borderBottomWidth={1} borderColor="$borderColor">
          <Text id="local-ai-title" tag="h2" fontSize="$5" fontWeight="600" color="$color">
            Local AI
          </Text>
          <Button size="icon-sm" variant="ghost" aria-label="Close" onPress={() => setOpen(false)}>
            ✕
          </Button>
        </XStack>

        <YStack flexShrink={1} minH={0} overflow="scroll" px="$4" py="$3" gap="$4">
          <YStack
            role="status"
            data-testid="local-ai-status"
            gap="$2"
            p="$3"
            rounded="$4"
            bg="$color3"
          >
            <Text fontSize="$4" fontWeight="600" color="$color">
              {header.title}
            </Text>
            {header.body ? (
              <Text fontSize="$3" color="$color11">
                {header.body}
              </Text>
            ) : null}
            {status?.serve_error && state.kind !== 'running' ? (
              <Text role="alert" fontSize="$2" color="$red10">
                {`The model stopped: ${status.serve_error.split('\n').filter(Boolean).pop()}`}
              </Text>
            ) : null}
            {header.action ? <XStack>{header.action}</XStack> : null}
            {/* host.tsx sends a chat to the local engine only when no session is held; a
                signed-in window's chats go to the cloud whatever is downloaded here. */}
            {keychain.getItem('hanzo_iam_access_token') ? (
              <Text data-testid="local-ai-signed-in-note" fontSize="$2" color="$color11">
                {`You are signed in, so chat uses ${getBrand().name}’s cloud models. A local model answers when you use ${getBrand().name} without signing in.`}
              </Text>
            ) : null}
          </YStack>

          <YStack gap="$2">
            <Text tag="h3" fontSize="$4" fontWeight="600" color="$color">
              {ram ? `Recommended for this computer (${ram} GB memory)` : 'Recommended'}
            </Text>
            {recommended.map(card)}
          </YStack>

          <YStack gap="$2">
            <Text tag="h3" fontSize="$4" fontWeight="600" color="$color">
              {`All models (${LOCAL_SOURCES.length})`}
            </Text>
            {LOCAL_SOURCES.map(card)}
          </YStack>

          <details
            open={advanced}
            onToggle={(e) => setAdvanced((e.currentTarget as HTMLDetailsElement).open)}
            data-testid="local-ai-advanced"
          >
            <summary style={{ cursor: 'pointer', padding: '4px 0' }}>
              <Text fontSize="$3" fontWeight="600" color="$color">
                Advanced
              </Text>
            </summary>
            <YStack gap="$3" pt="$2">
              <YStack gap="$1">
                <Text fontSize="$3" fontWeight="600" color="$color">
                  Engine
                </Text>
                <Text fontSize="$2" color="$color11">
                  {`Program: ${status?.engine ?? 'not installed (looked for hanzo-engine and hanzo-server beside the app and on PATH, or HANZO_ENGINE_BIN)'}`}
                </Text>
                <Text fontSize="$2" color="$color11">
                  {`Models folder: ${status?.cache_dir ?? 'unknown'}`}
                </Text>
                <Text fontSize="$2" color="$color11">
                  {`Address: ${LOCAL_ENGINE_URL} (this computer only)`}
                </Text>
              </YStack>

              <YStack gap="$2">
                <Text fontSize="$3" fontWeight="600" color="$color">
                  Custom endpoint
                </Text>
                <Text fontSize="$2" color="$color11">
                  Send local chat to another OpenAI-compatible server first (on this computer or your network).
                </Text>
                <XStack gap="$2" flexWrap="wrap">
                  <YStack flex={1} minW={220}>
                    <Input
                      type="url"
                      aria-label="Custom endpoint address"
                      value={customUrl}
                      onChangeText={setCustomUrl}
                      placeholder="http://10.0.0.19:36900"
                    />
                  </YStack>
                  <Button size="sm" variant="outline" onPress={() => saveCustom(customUrl)}>
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" disabled={scanning || !isTauri()} onPress={() => void scanLan()}>
                    {scanning ? 'Searching…' : 'Find on network'}
                  </Button>
                </XStack>
                {customNote ? (
                  <Text fontSize="$2" color="$color11">
                    {customNote}
                  </Text>
                ) : null}
                {lanMessage ? (
                  <Text data-testid="local-ai-lan-message" fontSize="$2" color="$color11">
                    {lanMessage}
                  </Text>
                ) : null}
                {lanEngines.map((eng) => (
                  <XStack key={eng.base_url} items="center" justify="space-between" gap="$2" flexWrap="wrap">
                    <Text fontSize="$2" color="$color">
                      {`${eng.name} (${eng.base_url}) ${eng.models.join(', ')}`}
                    </Text>
                    <Button size="xs" variant="outline" onPress={() => saveCustom(eng.base_url)}>
                      Use
                    </Button>
                  </XStack>
                ))}
              </YStack>
            </YStack>
          </details>
        </YStack>
      </YStack>
      {/* Remove deletes the copy in the shared Hugging Face folder, which other
          tools on this computer read too, so it is never done on one press. */}
      <AlertDialog open={removing !== null} onOpenChange={(next) => !next && setRemoving(null)}>
        {removing ? (
          <AlertDialogContent data-testid="local-ai-remove-confirm">
            <AlertDialogTitle>{`Remove ${removing.title}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {`This deletes ${formatSize(status?.installed.find((m) => m.repo === removing.repo)?.folder_bytes ?? removing.bytes)} from this computer. Other programs that use the same model from the shared Hugging Face folder lose it too. You can download it again later.`}
            </AlertDialogDescription>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep it</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  const src = removing;
                  setRemoving(null);
                  void remove(src);
                }}
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        ) : null}
      </AlertDialog>
    </div>
  );
}
