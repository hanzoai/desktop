import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

import rawCatalog from './lib/hanzo-node-manager/model-catalog.json';
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

export const LOCAL_ENGINE_PORT_URL = 'http://127.0.0.1:36900';
export const LOCAL_OLLAMA_URL = 'http://127.0.0.1:11434';
export const OPEN_LOCAL_AI_EVENT = 'hanzo:open-local-ai';
export const LOCAL_MODELS_UPDATED_EVENT = 'hanzo:local-models-updated';
const CUSTOM_ENGINE_STORAGE_KEY = 'hanzo:local:engine-url';

export interface CatalogTag {
  name: string;
  hash: string;
  size: string;
  isDefault?: boolean;
}

export interface CatalogModel {
  name: string;
  description: string;
  supportTools: boolean;
  defaultTag: string;
  tags: CatalogTag[];
  embedding: boolean;
  vision: boolean;
  thinking: boolean;
  cloud: boolean;
}

export interface InstalledModelInfo {
  id: string;
  sizeBytes?: number;
  source: 'hanzo-engine' | 'ollama' | 'custom';
}

export interface LocalNodeOptions {
  node_api_ip?: string;
  node_api_port?: string;
  node_port?: string;
  node_ws_port?: string;
  node_storage_path?: string;
  first_device_needs_registration_code?: string;
  default_embedding_model?: string;
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

// Filter out qwen2 models (Zen models: qwen3+ only, NOT qwen2) and embedding-only models for chat
const ALL_CATALOG_MODELS: CatalogModel[] = (rawCatalog as CatalogModel[]).filter(
  (m) => !m.name.toLowerCase().includes('qwen2'),
);

// Map friendly Zen model aliases to underlying weights when pulling via Ollama registry if needed
const OLLAMA_PULL_ALIASES: Record<string, string> = {
  'zen-nano:0.6b': 'qwen3:0.6b',
  'zen-agent:4b': 'qwen3:4b',
  'zen-coder:24b': 'qwen3-coder:30b',
  'zen4:latest': 'qwen3:8b',
  'zen4:4b': 'qwen3:4b',
  'zen4:8b': 'qwen3:8b',
  'zen4:14b': 'qwen3:14b',
  'zen4:30b': 'qwen3:30b',
  'zen4:80b': 'qwen3:32b',
  'zen4-coder:latest': 'qwen3-coder:30b',
  'zen4-coder:31b': 'qwen3-coder:30b',
};

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

let cachedInstalledModels: InstalledModelInfo[] = [];
let lastProbeAt = 0;

export async function probeInstalledLocalModels(force = false): Promise<InstalledModelInfo[]> {
  if (!force && Date.now() - lastProbeAt < 3000 && cachedInstalledModels.length > 0) {
    return cachedInstalledModels;
  }
  const found: InstalledModelInfo[] = [];
  const seen = new Set<string>();

  // 1. Probe custom engine URL if configured
  const customUrl = getCustomEngineUrl();
  if (customUrl) {
    try {
      const base = customUrl.endsWith('/v1') ? customUrl : `${customUrl}/v1`;
      const res = await fetch(`${base}/models`, { signal: AbortSignal.timeout(1500) });
      if (res.ok) {
        const body = await res.json();
        const rows = Array.isArray(body?.data) ? body.data : [];
        for (const r of rows) {
          if (r?.id && !seen.has(r.id)) {
            seen.add(r.id);
            found.push({ id: r.id, source: 'custom' });
          }
        }
      }
    } catch {
      // ignore offline custom engine
    }
  }

  // 2. Probe embedded Hanzo Engine (:36900)
  try {
    const res = await fetch(`${LOCAL_ENGINE_PORT_URL}/v1/models`, {
      signal: AbortSignal.timeout(1200),
    });
    if (res.ok) {
      const body = await res.json();
      const rows = Array.isArray(body?.data) ? body.data : [];
      for (const r of rows) {
        if (r?.id && !seen.has(r.id)) {
          seen.add(r.id);
          found.push({ id: r.id, source: 'hanzo-engine' });
        }
      }
    }
  } catch {
    // :36900 not running
  }

  // 3. Probe local Ollama runtime (:11434)
  try {
    const res = await fetch(`${LOCAL_OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(1200),
    });
    if (res.ok) {
      const body = await res.json();
      const models = Array.isArray(body?.models) ? body.models : [];
      for (const m of models) {
        const name = String(m?.name || m?.model || '').trim();
        if (!name || name.toLowerCase().includes('qwen2')) continue;
        if (!seen.has(name)) {
          seen.add(name);
          found.push({ id: name, sizeBytes: m?.size, source: 'ollama' });
        }
        // If qwen3:0.6b is installed, also mark zen-nano:0.6b as ready
        for (const [zenTag, targetTag] of Object.entries(OLLAMA_PULL_ALIASES)) {
          if (name === targetTag && !seen.has(zenTag)) {
            seen.add(zenTag);
            found.push({ id: zenTag, sizeBytes: m?.size, source: 'ollama' });
          }
        }
      }
    }
  } catch {
    // :11434 not running
  }

  cachedInstalledModels = found;
  lastProbeAt = Date.now();
  return found;
}

function formatModelTitle(model: CatalogModel, tag: CatalogTag, installed: boolean): string {
  const baseName = model.name
    .split(/[-_]/)
    .map((w) => (w.toLowerCase() === 'zen' ? 'Zen' : w.toLowerCase() === 'zen4' ? 'Zen4' : w.toLowerCase() === 'vl' ? 'VL' : w.toLowerCase() === 'r1' ? 'R1' : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
  const paramPart = tag.name.includes(':') ? tag.name.split(':')[1] : '';
  const suffix = paramPart && paramPart !== 'latest' ? ` ${paramPart.toUpperCase()}` : '';
  const sizeBadge = tag.size && tag.size !== 'Unknown' ? ` · ${tag.size}` : '';
  const statusBadge = installed ? ' · Installed' : '';
  return `${baseName}${suffix} (Local${sizeBadge}${statusBadge})`;
}

/**
 * Builds the OpenAI-compatible `/v1/models` list for local / signed-out mode,
 * combining installed models with the curated local AI catalog so the composer's
 * ModelPicker lets the user browse and pick any local model.
 */
export async function buildLocalModelsCatalogResponse(): Promise<{ object: 'list'; data: Array<Record<string, unknown>> }> {
  const installed = await probeInstalledLocalModels();
  const installedSet = new Set(installed.map((m) => m.id));
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
      description: 'Default local AI model routed through your local Hanzo Node / Engine.',
      object: 'model',
      created: 1793775303,
      owned_by: 'hanzo-local',
      family: 'enso',
      class: 'free',
      context_window: 131072,
      supports_vision: true,
      supports_tools: true,
      supports_reasoning: true,
    });
  }

  // Second: any currently installed local models right at the top
  for (const inst of installed) {
    if (inst.id === 'default' || inst.id.includes('embed') || inst.id.includes('minilm')) continue;
    const isZen = inst.id.toLowerCase().startsWith('zen') || inst.id.toLowerCase().startsWith('qwen3');
    const isVision = inst.id.toLowerCase().includes('vl') || inst.id.toLowerCase().includes('vision') || inst.id.toLowerCase().includes('llava');
    pushModel({
      id: inst.id,
      name: `${inst.id} (Local · Installed)`,
      description: `Installed on local ${inst.source} engine`,
      object: 'model',
      created: 1793775303,
      owned_by: isZen ? 'zenlm' : 'local',
      ...(isZen ? { family: 'zen' } : {}),
      class: 'free',
      context_window: 131072,
      supports_vision: isVision,
      supports_tools: true,
      supports_reasoning: true,
    });
  }

  // Third: all chat models from model-catalog.json (default tag + popular size tags)
  for (const model of ALL_CATALOG_MODELS) {
    if (model.embedding) continue;
    const isZen = model.name.toLowerCase().startsWith('zen');
    const ownedBy = isZen
      ? 'zenlm'
      : model.name.startsWith('qwen')
        ? 'zenlm'
        : model.name.startsWith('deepseek')
          ? 'deepseek'
          : model.name.startsWith('llama')
            ? 'meta-llama'
            : model.name.startsWith('gemma')
              ? 'google'
              : model.name.startsWith('mistral') || model.name.startsWith('devstral') || model.name.startsWith('ministral')
                ? 'mistralai'
                : 'local';

    // Include the default tag plus up to 3 local (non-cloud) tags per model family
    const localTags = model.tags.filter((t) => !t.name.endsWith('-cloud') && t.size !== 'Unknown');
    const chosenTags = localTags.slice(0, 4);
    if (chosenTags.length === 0 && model.tags.length > 0) {
      chosenTags.push(model.tags[0]);
    }

    for (const tag of chosenTags) {
      const isInstalled = installedSet.has(tag.name);
      pushModel({
        id: tag.name,
        name: formatModelTitle(model, tag, isInstalled),
        description: model.description,
        object: 'model',
        created: 1793775303,
        owned_by: ownedBy,
        ...(isZen ? { family: 'zen' } : {}),
        class: 'free',
        context_window: 131072,
        supports_vision: Boolean(model.vision),
        supports_tools: Boolean(model.supportTools),
        supports_reasoning: Boolean(model.thinking),
      });
    }
  }

  return { object: 'list', data };
}

/**
 * Routes a local chat completion request to the best available local inference engine:
 * 1. Custom engine URL (if configured)
 * 2. Embedded Hanzo Engine (:36900)
 * 3. Local Ollama runtime (:11434/v1/chat/completions)
 *
 * If the requested model isn't installed yet or no local engine has a model loaded,
 * opens the Local AI & Node Manager modal so the user can download/select one.
 */
export async function handleLocalChatCompletion(
  nativeFetch: typeof window.fetch,
  init?: RequestInit,
): Promise<Response> {
  const bodyText = typeof init?.body === 'string' ? init.body : '{}';
  let payload: Record<string, any> = {};
  try {
    payload = JSON.parse(bodyText || '{}');
  } catch {
    payload = {};
  }

  const requestedModel = String(payload.model || 'enso-free').trim();
  const installed = await probeInstalledLocalModels(true);

  // 1. Try custom engine URL if set
  const customUrl = getCustomEngineUrl();
  if (customUrl) {
    try {
      const base = customUrl.endsWith('/v1') ? customUrl : `${customUrl}/v1`;
      const res = await nativeFetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: init?.signal,
      });
      if (res.ok) return res;
    } catch {
      // fall through
    }
  }

  // 2. Try Hanzo Engine on :36900 if it has a loaded model
  if (installed.some((m) => m.source === 'hanzo-engine')) {
    try {
      const res = await nativeFetch(`${LOCAL_ENGINE_PORT_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          model: requestedModel === 'enso-free' || requestedModel === 'enso' ? 'default' : requestedModel,
        }),
        signal: init?.signal,
      });
      if (res.ok) return res;
    } catch {
      // fall through to :11434
    }
  }

  // 3. Try local Ollama OpenAI-compatible endpoint (:11434/v1/chat/completions)
  const ollamaModels = installed.filter(
    (m) => m.source === 'ollama' && !m.id.includes('embed') && !m.id.includes('minilm'),
  );
  if (ollamaModels.length > 0) {
    let targetModel = requestedModel;
    if (OLLAMA_PULL_ALIASES[targetModel]) {
      const aliased = OLLAMA_PULL_ALIASES[targetModel];
      if (ollamaModels.some((m) => m.id === aliased)) {
        targetModel = aliased;
      }
    }
    const exactMatch = ollamaModels.find((m) => m.id === targetModel);
    if (!exactMatch) {
      if (
        targetModel === 'enso-free' ||
        targetModel === 'zen-free' ||
        targetModel === 'enso' ||
        targetModel === 'default' ||
        targetModel === 'zen-nano:0.6b'
      ) {
        // Use the first installed local chat model (e.g. qwen3:0.6b)
        const realOllamaTag = OLLAMA_PULL_ALIASES[ollamaModels[0].id] || ollamaModels[0].id;
        targetModel = realOllamaTag;
      } else {
        // The user specifically selected an uninstalled model from the picker!
        // Open the Local AI modal focused on downloading this model.
        window.dispatchEvent(
          new CustomEvent(OPEN_LOCAL_AI_EVENT, {
            detail: { model: requestedModel, tab: 'models' },
          }),
        );
        return new Response(
          JSON.stringify({
            error: {
              message: `Local model "${requestedModel}" is not downloaded yet. Use the Local AI Manager to download it with 1 click, or pick an installed local model.`,
              code: 'local_model_not_installed',
            },
          }),
          { status: 503, headers: { 'Content-Type': 'application/json' } },
        );
      }
    } else if (OLLAMA_PULL_ALIASES[exactMatch.id]) {
      targetModel = OLLAMA_PULL_ALIASES[exactMatch.id];
    }

    try {
      // Strip cloud-only tools parameter if present so small local models answer directly
      const { tools: _tools, ...cleanPayload } = payload;
      const res = await nativeFetch(`${LOCAL_OLLAMA_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...cleanPayload,
          model: targetModel,
        }),
        signal: init?.signal,
      });
      if (res.ok) return res;
    } catch {
      // fall through
    }
  }

  // No local model is installed or running yet -> open the Local AI model selector/downloader!
  window.dispatchEvent(
    new CustomEvent(OPEN_LOCAL_AI_EVENT, {
      detail: { model: requestedModel !== 'enso-free' ? requestedModel : 'zen-nano:0.6b', tab: 'models' },
    }),
  );

  return new Response(
    JSON.stringify({
      error: {
        message:
          'No local AI model is loaded yet. Select or download a local model (such as Zen Nano 0.6B or Zen4 8B) in the Local AI & Node Manager.',
        code: 'local_model_required',
      },
    }),
    { status: 503, headers: { 'Content-Type': 'application/json' } },
  );
}

export function openLocalAiManager(detail?: { tab?: 'models' | 'node' | 'engine'; model?: string }) {
  window.dispatchEvent(new CustomEvent(OPEN_LOCAL_AI_EVENT, { detail }));
}

export function LocalAiManager() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'models' | 'node' | 'engine'>('models');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<'all' | 'installed' | 'zen' | 'vision' | 'coding' | 'reasoning'>('all');
  const [installed, setInstalled] = useState<InstalledModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>(() => kept().model || 'zen-nano:0.6b');

  // Pulling / downloading state
  const [pullingTag, setPullingTag] = useState<string | null>(null);
  const [pullStatus, setPullStatus] = useState<string>('');
  const [pullPercent, setPullPercent] = useState<number>(0);
  const [pullError, setPullError] = useState<string | null>(null);

  // Local Hanzo Node state
  const [nodeRunning, setNodeRunning] = useState<boolean>(false);
  const [nodeBusy, setNodeBusy] = useState<boolean>(false);
  const [nodeOptions, setNodeOptions] = useState<LocalNodeOptions | null>(null);
  const [nodeMessage, setNodeMessage] = useState<string>('');

  // Local Engine state
  const [engine36900Up, setEngine36900Up] = useState<boolean>(false);
  const [ollama11434Up, setOllama11434Up] = useState<boolean>(false);
  const [customEngineUrlState, setCustomEngineUrlState] = useState<string>(() => getCustomEngineUrl());
  const [lanEngines, setLanEngines] = useState<DiscoveredEngine[]>([]);
  const [discoveringLan, setDiscoveringLan] = useState<boolean>(false);
  const [ggufRepoOrPath, setGgufRepoOrPath] = useState<string>('Qwen/Qwen3-0.6B');
  const [loadingEngineModel, setLoadingEngineModel] = useState<boolean>(false);
  const [engineMessage, setEngineMessage] = useState<string>('');

  const refreshState = useCallback(async () => {
    const models = await probeInstalledLocalModels(true);
    setInstalled(models);
    setSelectedModel(kept().model || 'zen-nano:0.6b');

    // Check :36900
    try {
      const r = await fetch(`${LOCAL_ENGINE_PORT_URL}/health`, { signal: AbortSignal.timeout(1000) });
      setEngine36900Up(r.ok);
    } catch {
      setEngine36900Up(false);
    }

    // Check :11434
    try {
      const r = await fetch(`${LOCAL_OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(1000) });
      setOllama11434Up(r.ok);
    } catch {
      setOllama11434Up(false);
    }

    // Check hanzo-node via Tauri IPC
    if (isTauri()) {
      try {
        const running = await invoke<boolean>('hanzo_node_is_running');
        setNodeRunning(Boolean(running));
      } catch {
        setNodeRunning(false);
      }
      try {
        const opts = await invoke<LocalNodeOptions>('hanzo_node_get_options');
        setNodeOptions(opts);
      } catch {
        // ignore
      }
    }
  }, []);

  useEffect(() => {
    void refreshState();
  }, [refreshState]);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ tab?: 'models' | 'node' | 'engine'; model?: string }>).detail;
      if (detail?.tab) setTab(detail.tab);
      if (detail?.model && detail.model !== 'enso-free' && detail.model !== 'enso') {
        setSearch(detail.model.split(':')[0]);
      }
      setOpen(true);
      void refreshState();
    };
    window.addEventListener(OPEN_LOCAL_AI_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_LOCAL_AI_EVENT, onOpen);
  }, [refreshState]);

  // Listen for model picker changes when signed out: if the user picks a local model
  // from the composer's ModelPicker that is not yet downloaded, open the modal so they can pull it!
  useEffect(() => {
    const onMindChange = async () => {
      const current = kept().model;
      setSelectedModel(current);
      if (!current || current === 'enso' || current === 'enso-free' || current === 'free') return;
      const hasToken = Boolean(window.localStorage.getItem('hanzo_iam_access_token'));
      if (hasToken) return;
      const models = await probeInstalledLocalModels();
      const isInstalled = models.some((m) => m.id === current);
      const isCatalogModel = ALL_CATALOG_MODELS.some((m) => m.tags.some((t) => t.name === current));
      if (isCatalogModel && !isInstalled) {
        setSearch(current.split(':')[0]);
        setTab('models');
        setOpen(true);
      }
    };
    window.addEventListener('hanzo:mind', onMindChange);
    return () => window.removeEventListener('hanzo:mind', onMindChange);
  }, []);

  const handleSelectModel = (tag: string) => {
    keep({ model: tag });
    setSelectedModel(tag);
    window.dispatchEvent(new Event(LOCAL_MODELS_UPDATED_EVENT));
  };

  const handlePullModel = async (tag: string) => {
    if (pullingTag) return;
    setPullingTag(tag);
    setPullError(null);
    setPullStatus(`Connecting to local inference runtime…`);
    setPullPercent(2);

    const pullTarget = OLLAMA_PULL_ALIASES[tag] || tag;

    try {
      // Ensure local node/engine is spawned if Ollama is not answering yet
      if (!ollama11434Up && isTauri()) {
        setPullStatus('Starting local inference runtime…');
        try {
          await invoke('hanzo_node_spawn');
          await new Promise((r) => setTimeout(r, 1200));
        } catch {
          // continue and try :11434 directly
        }
      }

      const res = await fetch(`${LOCAL_OLLAMA_URL}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: pullTarget, stream: true }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`Local runtime returned HTTP ${res.status}. Make sure Ollama or Hanzo Engine is running.`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            if (msg.error) {
              throw new Error(String(msg.error));
            }
            if (msg.status) {
              setPullStatus(String(msg.status));
            }
            if (typeof msg.completed === 'number' && typeof msg.total === 'number' && msg.total > 0) {
              setPullPercent(Math.min(99, Math.round((msg.completed / msg.total) * 100)));
            }
          } catch (innerErr) {
            if (innerErr instanceof Error && innerErr.message !== 'Unexpected end of JSON input') {
              throw innerErr;
            }
          }
        }
      }

      setPullPercent(100);
      setPullStatus(`Installed ${tag}`);
      await refreshState();
      handleSelectModel(tag);
    } catch (err) {
      setPullError(
        err instanceof Error
          ? err.message
          : 'Could not download model. Ensure local inference engine (:11434 or :36900) is running.',
      );
    } finally {
      setPullingTag(null);
    }
  };

  const handleDeleteModel = async (tag: string) => {
    const deleteTarget = OLLAMA_PULL_ALIASES[tag] || tag;
    try {
      await fetch(`${LOCAL_OLLAMA_URL}/api/delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: deleteTarget }),
      });
      await refreshState();
    } catch {
      // ignore
    }
  };

  const handleStartNode = async () => {
    if (!isTauri()) return;
    setNodeBusy(true);
    setNodeMessage('Starting local Hanzo Node…');
    try {
      await invoke('hanzo_node_spawn');
      setNodeMessage('Local Hanzo Node is running.');
      await refreshState();
    } catch (err) {
      setNodeMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setNodeBusy(false);
    }
  };

  const handleStopNode = async () => {
    if (!isTauri()) return;
    setNodeBusy(true);
    setNodeMessage('Stopping local Hanzo Node…');
    try {
      await invoke('hanzo_node_kill');
      setNodeMessage('Local Hanzo Node stopped.');
      await refreshState();
    } catch (err) {
      setNodeMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setNodeBusy(false);
    }
  };

  const handleOpenStorage = async () => {
    if (!isTauri()) return;
    try {
      await invoke('hanzo_node_open_storage_location');
    } catch (err) {
      setNodeMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDiscoverLan = async () => {
    if (!isTauri()) return;
    setDiscoveringLan(true);
    try {
      const found = await invoke<DiscoveredEngine[]>('engines_discover');
      setLanEngines(Array.isArray(found) ? found : []);
    } catch {
      setLanEngines([]);
    } finally {
      setDiscoveringLan(false);
    }
  };

  const handleLoadIntoHanzoEngine = async () => {
    if (!ggufRepoOrPath.trim()) return;
    setLoadingEngineModel(true);
    setEngineMessage(`Loading ${ggufRepoOrPath} into Hanzo Engine…`);
    try {
      const res = await fetch(`${LOCAL_ENGINE_PORT_URL}/v1/engine/load`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_id: ggufRepoOrPath.trim(),
          format: ggufRepoOrPath.endsWith('.gguf') ? 'gguf' : 'auto',
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      setEngineMessage(`Loaded ${ggufRepoOrPath} on :36900.`);
      await refreshState();
    } catch (err) {
      setEngineMessage(
        err instanceof Error
          ? `Engine load error: ${err.message}`
          : 'Hanzo Engine (:36900) is not listening.',
      );
    } finally {
      setLoadingEngineModel(false);
    }
  };

  const installedSet = useMemo(() => new Set(installed.map((m) => m.id)), [installed]);

  const filteredModels = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ALL_CATALOG_MODELS.filter((m) => {
      if (m.embedding) return false;
      if (category === 'installed' && !m.tags.some((t) => installedSet.has(t.name))) return false;
      if (category === 'zen' && !m.name.toLowerCase().startsWith('zen')) return false;
      if (category === 'vision' && !m.vision) return false;
      if (category === 'coding' && !m.name.toLowerCase().includes('coder') && !m.name.toLowerCase().includes('code') && !m.name.toLowerCase().includes('devstral')) return false;
      if (category === 'reasoning' && !m.thinking) return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q) ||
        m.tags.some((t) => t.name.toLowerCase().includes(q))
      );
    });
  }, [search, category, installedSet]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Local AI Models & Hanzo Node Manager"
      data-slot="local-ai-modal"
      data-testid="local-ai-manager-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(0, 0, 0, 0.72)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 780,
          maxHeight: '86vh',
          backgroundColor: '#121212',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: 16,
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.75)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: '#f5f5f5',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                backgroundColor: nodeRunning || ollama11434Up || engine36900Up ? '#22c55e' : '#eab308',
                boxShadow:
                  nodeRunning || ollama11434Up || engine36900Up
                    ? '0 0 10px rgba(34, 197, 94, 0.6)'
                    : 'none',
              }}
            />
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em' }}>
                Local AI Models &amp; Hanzo Node
              </div>
              <div style={{ fontSize: 12, color: '#a1a1aa', marginTop: 2 }}>
                Browse, download, and run local AI models offline · Manage local Hanzo Node &amp; multimodal inference
              </div>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close Local AI Manager"
            onClick={() => setOpen(false)}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#d4d4d8',
              width: 30,
              height: 30,
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 15,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>

        {/* Navigation Tabs */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
            backgroundColor: '#161616',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', gap: 6 }}>
            {(
              [
                { id: 'models', label: `Local AI Models (${ALL_CATALOG_MODELS.filter((m) => !m.embedding).length})` },
                { id: 'node', label: `Local Hanzo Node (${nodeRunning ? 'Running' : 'Stopped'})` },
                { id: 'engine', label: `Inference Engine (${engine36900Up || ollama11434Up ? 'Online' : 'Offline'})` },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                data-testid={`local-ai-tab-${t.id}`}
                onClick={() => setTab(t.id)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                  border: tab === t.id ? '1px solid rgba(255,255,255,0.18)' : '1px solid transparent',
                  backgroundColor: tab === t.id ? 'rgba(255,255,255,0.1)' : 'transparent',
                  color: tab === t.id ? '#ffffff' : '#a1a1aa',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div style={{ fontSize: 12, color: '#a1a1aa' }}>
            Active model:{' '}
            <strong style={{ color: '#ffffff' }}>
              {selectedModel === 'enso-free' ? (installed[0]?.id ?? 'zen-nano:0.6b') : selectedModel}
            </strong>
          </div>
        </div>

        {/* Download Progress Banner */}
        {(pullingTag || pullError) && (
          <div
            style={{
              padding: '10px 20px',
              backgroundColor: pullError ? 'rgba(239, 68, 68, 0.14)' : 'rgba(255, 255, 255, 0.05)',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span>
                {pullError ? (
                  <span style={{ color: '#f87171' }}>{pullError}</span>
                ) : (
                  <>
                    Downloading <strong>{pullingTag}</strong>: {pullStatus}
                  </>
                )}
              </span>
              {pullingTag && <span>{pullPercent}%</span>}
            </div>
            {pullingTag && (
              <div
                style={{
                  height: 5,
                  width: '100%',
                  backgroundColor: 'rgba(255,255,255,0.1)',
                  borderRadius: 999,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${pullPercent}%`,
                    backgroundColor: '#ffffff',
                    transition: 'width 0.2s ease',
                  }}
                />
              </div>
            )}
          </div>
        )}

        {/* TAB 1: Browse & Download Local AI Models */}
        {tab === 'models' && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <div
              style={{
                padding: '12px 20px',
                display: 'flex',
                flexWrap: 'wrap',
                gap: 10,
                alignItems: 'center',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <input
                type="search"
                data-testid="local-ai-search-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search local models (zen4, qwen3, deepseek-r1, vision, coder…)"
                style={{
                  flex: 1,
                  minWidth: 220,
                  height: 34,
                  padding: '0 12px',
                  borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.12)',
                  backgroundColor: '#0a0a0a',
                  color: '#f5f5f5',
                  fontSize: 13,
                  outline: 'none',
                }}
              />
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {(
                  [
                    { id: 'all', label: 'All' },
                    { id: 'installed', label: `Installed (${installed.length})` },
                    { id: 'zen', label: 'Zen LM' },
                    { id: 'vision', label: 'Vision / Images' },
                    { id: 'coding', label: 'Coding' },
                    { id: 'reasoning', label: 'Reasoning' },
                  ] as const
                ).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategory(c.id)}
                    style={{
                      padding: '5px 10px',
                      borderRadius: 999,
                      fontSize: 12,
                      cursor: 'pointer',
                      border: category === c.id ? '1px solid rgba(255,255,255,0.24)' : '1px solid rgba(255,255,255,0.08)',
                      backgroundColor: category === c.id ? '#ffffff' : 'transparent',
                      color: category === c.id ? '#09090b' : '#d4d4d8',
                      fontWeight: category === c.id ? 600 : 400,
                    }}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '12px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              {filteredModels.map((model) => {
                const localTags = model.tags.filter((t) => !t.name.endsWith('-cloud') && t.size !== 'Unknown');
                const tagsToShow = localTags.length > 0 ? localTags.slice(0, 6) : model.tags.slice(0, 3);
                return (
                  <div
                    key={model.name}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 12,
                      border: '1px solid rgba(255,255,255,0.08)',
                      backgroundColor: '#18181b',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: '#ffffff' }}>{model.name}</span>
                        {model.name.startsWith('zen') && (
                          <span
                            style={{
                              fontSize: 11,
                              padding: '2px 7px',
                              borderRadius: 999,
                              backgroundColor: 'rgba(255,255,255,0.12)',
                              color: '#ffffff',
                              fontWeight: 500,
                            }}
                          >
                            Zen LM
                          </span>
                        )}
                        {model.vision && (
                          <span
                            style={{
                              fontSize: 11,
                              padding: '2px 7px',
                              borderRadius: 999,
                              backgroundColor: 'rgba(59, 130, 246, 0.18)',
                              color: '#93c5fd',
                            }}
                          >
                            Vision · Images
                          </span>
                        )}
                        {model.supportTools && (
                          <span
                            style={{
                              fontSize: 11,
                              padding: '2px 7px',
                              borderRadius: 999,
                              backgroundColor: 'rgba(16, 185, 129, 0.16)',
                              color: '#6ee7b7',
                            }}
                          >
                            Tools
                          </span>
                        )}
                        {model.thinking && (
                          <span
                            style={{
                              fontSize: 11,
                              padding: '2px 7px',
                              borderRadius: 999,
                              backgroundColor: 'rgba(168, 85, 247, 0.18)',
                              color: '#d8b4fe',
                            }}
                          >
                            Reasoning
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ fontSize: 12, color: '#a1a1aa', lineHeight: 1.45 }}>{model.description}</div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
                      {tagsToShow.map((tag) => {
                        const isInstalled = installedSet.has(tag.name);
                        const isSelected = selectedModel === tag.name;
                        const isPulling = pullingTag === tag.name;

                        return (
                          <div
                            key={tag.name}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '5px 10px',
                              borderRadius: 8,
                              border: isSelected
                                ? '1px solid #ffffff'
                                : isInstalled
                                  ? '1px solid rgba(34, 197, 94, 0.45)'
                                  : '1px solid rgba(255,255,255,0.1)',
                              backgroundColor: isSelected
                                ? 'rgba(255,255,255,0.14)'
                                : isInstalled
                                  ? 'rgba(34, 197, 94, 0.08)'
                                  : 'rgba(255,255,255,0.03)',
                              fontSize: 12,
                            }}
                          >
                            <span style={{ fontWeight: 500, color: '#f4f4f5' }}>{tag.name}</span>
                            {tag.size && tag.size !== 'Unknown' && (
                              <span style={{ color: '#71717a', fontSize: 11 }}>{tag.size}</span>
                            )}
                            {isInstalled ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleSelectModel(tag.name);
                                    setOpen(false);
                                  }}
                                  style={{
                                    padding: '2px 8px',
                                    borderRadius: 6,
                                    border: 0,
                                    backgroundColor: isSelected ? '#22c55e' : '#ffffff',
                                    color: '#09090b',
                                    fontWeight: 600,
                                    fontSize: 11,
                                    cursor: 'pointer',
                                  }}
                                >
                                  {isSelected ? '✓ Active' : 'Use in Chat'}
                                </button>
                                <button
                                  type="button"
                                  title={`Delete ${tag.name}`}
                                  onClick={() => void handleDeleteModel(tag.name)}
                                  style={{
                                    padding: '2px 5px',
                                    borderRadius: 6,
                                    border: 0,
                                    backgroundColor: 'transparent',
                                    color: '#71717a',
                                    fontSize: 11,
                                    cursor: 'pointer',
                                  }}
                                >
                                  ✕
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                disabled={Boolean(pullingTag)}
                                onClick={() => void handlePullModel(tag.name)}
                                style={{
                                  padding: '2px 8px',
                                  borderRadius: 6,
                                  border: '1px solid rgba(255,255,255,0.18)',
                                  backgroundColor: 'rgba(255,255,255,0.08)',
                                  color: '#ffffff',
                                  fontWeight: 500,
                                  fontSize: 11,
                                  cursor: pullingTag ? 'default' : 'pointer',
                                  opacity: pullingTag && !isPulling ? 0.5 : 1,
                                }}
                              >
                                {isPulling ? `${pullPercent}%…` : '↓ Download'}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: Local Hanzo Node Management */}
        {tab === 'node' && (
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
            <div
              style={{
                padding: 16,
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.08)',
                backgroundColor: '#18181b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
                flexWrap: 'wrap',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      width: 9,
                      height: 9,
                      borderRadius: 999,
                      backgroundColor: nodeRunning ? '#22c55e' : '#ef4444',
                    }}
                  />
                  <span style={{ fontSize: 15, fontWeight: 600 }}>
                    Local Hanzo Node ({nodeRunning ? 'Running' : 'Stopped'})
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#a1a1aa', marginTop: 4 }}>
                  API Endpoint: <code>http://{nodeOptions?.node_api_ip || '127.0.0.1'}:{nodeOptions?.node_api_port || '3690'}</code>
                  {' · '}P2P: <code>:{nodeOptions?.node_port || '3691'}</code>
                  {' · '}WS: <code>:{nodeOptions?.node_ws_port || '3692'}</code>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                {nodeRunning ? (
                  <>
                    <button
                      type="button"
                      disabled={nodeBusy}
                      onClick={() => void handleStartNode()}
                      style={{
                        padding: '7px 14px',
                        borderRadius: 8,
                        border: '1px solid rgba(255,255,255,0.16)',
                        backgroundColor: 'rgba(255,255,255,0.08)',
                        color: '#ffffff',
                        fontSize: 13,
                        fontWeight: 500,
                        cursor: 'pointer',
                      }}
                    >
                      Restart Node
                    </button>
                    <button
                      type="button"
                      disabled={nodeBusy}
                      onClick={() => void handleStopNode()}
                      style={{
                        padding: '7px 14px',
                        borderRadius: 8,
                        border: '1px solid rgba(239,68,68,0.4)',
                        backgroundColor: 'rgba(239,68,68,0.12)',
                        color: '#fca5a5',
                        fontSize: 13,
                        fontWeight: 500,
                        cursor: 'pointer',
                      }}
                    >
                      Stop Node
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={nodeBusy}
                    onClick={() => void handleStartNode()}
                    style={{
                      padding: '7px 16px',
                      borderRadius: 8,
                      border: 0,
                      backgroundColor: '#ffffff',
                      color: '#09090b',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {nodeBusy ? 'Starting…' : 'Start Local Node'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void handleOpenStorage()}
                  style={{
                    padding: '7px 12px',
                    borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.14)',
                    backgroundColor: 'transparent',
                    color: '#d4d4d8',
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  Open Storage Folder
                </button>
              </div>
            </div>

            {nodeMessage && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  backgroundColor: 'rgba(255,255,255,0.06)',
                  fontSize: 12,
                  color: '#e4e4e7',
                }}
              >
                {nodeMessage}
              </div>
            )}

            <div
              style={{
                padding: 16,
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.08)',
                backgroundColor: '#18181b',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                fontSize: 12,
                color: '#a1a1aa',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: '#ffffff' }}>Node Configuration</div>
              <div>
                <strong>Storage Path:</strong> <code>{nodeOptions?.node_storage_path || '~/Library/Application Support/com.hanzo.desktop/node_storage'}</code>
              </div>
              <div>
                <strong>Default Embedding Model:</strong> <code>{nodeOptions?.default_embedding_model || 'snowflake-arctic-embed:xs'}</code>
              </div>
              <div>
                <strong>Multimodal Images &amp; Files:</strong> Enabled locally (paste, drag-and-drop, or click <code>+</code> in the chat composer to attach images and files directly without signing in).
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: Local Inference Engine & LAN Discovery */}
        {tab === 'engine' && (
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
            <div
              style={{
                padding: 16,
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.08)',
                backgroundColor: '#18181b',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 600 }}>Embedded Hanzo Engine (:36900) — Load GGUF / Safetensors / MLX</div>
              <div style={{ fontSize: 12, color: '#a1a1aa' }}>
                Status: <strong style={{ color: engine36900Up ? '#22c55e' : '#a1a1aa' }}>{engine36900Up ? 'Listening on 127.0.0.1:36900' : 'Idle'}</strong>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  value={ggufRepoOrPath}
                  onChange={(e) => setGgufRepoOrPath(e.target.value)}
                  placeholder="HuggingFace model ID (e.g. Qwen/Qwen3-0.6B) or local .gguf path"
                  style={{
                    flex: 1,
                    height: 34,
                    padding: '0 12px',
                    borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.12)',
                    backgroundColor: '#0a0a0a',
                    color: '#f5f5f5',
                    fontSize: 13,
                  }}
                />
                <button
                  type="button"
                  disabled={loadingEngineModel}
                  onClick={() => void handleLoadIntoHanzoEngine()}
                  style={{
                    padding: '0 14px',
                    borderRadius: 8,
                    border: 0,
                    backgroundColor: '#ffffff',
                    color: '#09090b',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {loadingEngineModel ? 'Loading…' : 'Load Model'}
                </button>
              </div>
              {engineMessage && <div style={{ fontSize: 12, color: '#d4d4d8' }}>{engineMessage}</div>}
            </div>

            <div
              style={{
                padding: 16,
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.08)',
                backgroundColor: '#18181b',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 600 }}>Custom / LAN OpenAI-Compatible Inference Endpoint</div>
              <div style={{ fontSize: 12, color: '#a1a1aa' }}>
                Point local chat at any local or LAN inference server (Hanzo Engine, MLX Server, vLLM, LM Studio, or Ollama).
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="url"
                  value={customEngineUrlState}
                  onChange={(e) => setCustomEngineUrlState(e.target.value)}
                  placeholder="http://127.0.0.1:11434 or http://10.0.0.19:36900"
                  style={{
                    flex: 1,
                    height: 34,
                    padding: '0 12px',
                    borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.12)',
                    backgroundColor: '#0a0a0a',
                    color: '#f5f5f5',
                    fontSize: 13,
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    setCustomEngineUrl(customEngineUrlState);
                    void refreshState();
                    setEngineMessage(
                      customEngineUrlState.trim()
                        ? `Saved custom engine URL: ${customEngineUrlState.trim()}`
                        : 'Cleared custom engine URL (using automatic local detection).',
                    );
                  }}
                  style={{
                    padding: '0 14px',
                    borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.16)',
                    backgroundColor: 'rgba(255,255,255,0.1)',
                    color: '#ffffff',
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  Save Endpoint
                </button>
                <button
                  type="button"
                  disabled={discoveringLan}
                  onClick={() => void handleDiscoverLan()}
                  style={{
                    padding: '0 12px',
                    borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.12)',
                    backgroundColor: 'transparent',
                    color: '#d4d4d8',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  {discoveringLan ? 'Scanning LAN…' : 'Scan LAN'}
                </button>
              </div>
              {lanEngines.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                  {lanEngines.map((eng) => (
                    <div
                      key={eng.base_url}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 10px',
                        borderRadius: 8,
                        backgroundColor: 'rgba(255,255,255,0.04)',
                        fontSize: 12,
                      }}
                    >
                      <span>
                        <strong>{eng.name}</strong> ({eng.base_url}) — {eng.models.join(', ') || 'ready'}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setCustomEngineUrlState(eng.base_url);
                          setCustomEngineUrl(eng.base_url);
                          void refreshState();
                        }}
                        style={{
                          padding: '3px 8px',
                          borderRadius: 6,
                          border: 0,
                          backgroundColor: '#ffffff',
                          color: '#09090b',
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Use Engine
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
