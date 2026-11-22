import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
  ChevronRight,
  Columns2,
  Cpu,
  ExternalLink,
  FileDiff,
  FileText,
  Files,
  Folder,
  GitPullRequest,
  Globe,
  Link2,
  Maximize2,
  MessageSquareMore,
  Minimize2,
  PanelBottom,
  PanelRight,
  Plus,
  RefreshCw,
  Rows2,
  Send,
  Settings,
  Smartphone,
  SquareMenu,
  SquareTerminal,
  X,
} from 'lucide-react';

import { Update } from './update';
import { getFileVisual } from './lib/file-style';

export type SurfaceKind =
  | 'browser'
  | 'terminal'
  | 'files'
  | 'diff'
  | 'pr'
  | 'linked'
  | 'device'
  | 'chat';

export interface SurfaceTab {
  id: string;
  kind: SurfaceKind;
  title: string;
  url?: string;
}

interface WorkspaceState {
  rightOpen: boolean;
  maximized: boolean;
  bottomOpen: boolean;
  detailsOpen: boolean;
  width: number;
  tabs: SurfaceTab[];
  activeTabId: string | null;
}

const WIDTH_KEY = 'hanzo.desktop.surfaceWidth';

function readWidth(): number {
  try {
    const n = Number(localStorage.getItem(WIDTH_KEY));
    if (Number.isFinite(n) && n >= 320 && n <= 820) return n;
  } catch {
    // ignore storage errors
  }
  return 440;
}

let state: WorkspaceState = {
  rightOpen: false,
  maximized: false,
  bottomOpen: false,
  detailsOpen: false,
  width: typeof window !== 'undefined' ? readWidth() : 440,
  tabs: [],
  activeTabId: null,
};

const listeners = new Set<() => void>();

function emit(next: WorkspaceState) {
  state = next;
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useWorkspacePanels(): WorkspaceState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

export function toggleRightPanel() {
  emit({
    ...state,
    rightOpen: !state.rightOpen,
    maximized: state.rightOpen ? false : state.maximized,
  });
}

export function toggleMaximized() {
  if (!state.rightOpen) return;
  emit({ ...state, maximized: !state.maximized });
}

export function toggleBottomDrawer() {
  emit({ ...state, bottomOpen: !state.bottomOpen });
}

export function toggleDetailsPopover() {
  emit({ ...state, detailsOpen: !state.detailsOpen });
}

export function closeDetailsPopover() {
  if (!state.detailsOpen) return;
  emit({ ...state, detailsOpen: false });
}

export function setSurfaceWidth(width: number) {
  const clamped = Math.max(320, Math.min(820, Math.round(width)));
  try {
    localStorage.setItem(WIDTH_KEY, String(clamped));
  } catch {
    // ignore
  }
  emit({ ...state, width: clamped });
}

export function openSurface(kind: SurfaceKind, opts?: { title?: string; url?: string }) {
  const meta = SURFACES.find((s) => s.kind === kind);
  const existing =
    kind === 'files' || kind === 'device' || kind === 'diff' || kind === 'pr' || kind === 'linked'
      ? state.tabs.find((t) => t.kind === kind)
      : undefined;
  if (existing) {
    emit({ ...state, rightOpen: true, activeTabId: existing.id });
    return;
  }
  const tab: SurfaceTab = {
    id: `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    kind,
    title: opts?.title ?? meta?.label ?? kind,
    url: kind === 'browser' ? (opts?.url ?? 'http://localhost:3000') : opts?.url,
  };
  emit({
    ...state,
    rightOpen: true,
    tabs: [...state.tabs, tab],
    activeTabId: tab.id,
  });
}

export function selectSurfaceTab(id: string) {
  emit({ ...state, activeTabId: id });
}

if (typeof window !== 'undefined') {
  window.addEventListener('hanzo:open-local-terminal', () => {
    openSurface('terminal');
  });
}

export function closeSurfaceTab(id: string) {
  const remaining = state.tabs.filter((t) => t.id !== id);
  const nextActive =
    state.activeTabId === id ? (remaining[remaining.length - 1]?.id ?? null) : state.activeTabId;
  emit({ ...state, tabs: remaining, activeTabId: nextActive });
}

export interface SurfaceDef {
  kind: SurfaceKind;
  label: string;
  shortcut: string;
  available: boolean;
  hasSubmenu?: boolean;
  icon: typeof Globe;
}

export const SURFACES: readonly SurfaceDef[] = [
  { kind: 'browser', label: 'Browser', shortcut: 'B', available: true, hasSubmenu: true, icon: Globe },
  { kind: 'terminal', label: 'Terminal', shortcut: 'T', available: true, icon: SquareTerminal },
  { kind: 'files', label: 'Files', shortcut: 'F', available: true, icon: Files },
  { kind: 'diff', label: 'Diff', shortcut: 'D', available: true, icon: FileDiff },
  { kind: 'pr', label: 'Pull request', shortcut: 'P', available: true, icon: GitPullRequest },
  { kind: 'linked', label: 'Linked items', shortcut: 'L', available: true, icon: Link2 },
  { kind: 'device', label: 'Device', shortcut: 'M', available: true, icon: Smartphone },
  { kind: 'chat', label: 'Side chat', shortcut: 'S', available: true, icon: MessageSquareMore },
];

/**
 * Stationary top-right controls pinned inside the fixed title-bar.
 * Because these live in the window's fixed top-right slot, opening, closing,
 * resizing, or maximizing the right panel NEVER shifts a single icon.
 */
export function TopRightControls() {
  const { rightOpen, maximized, bottomOpen, detailsOpen } = useWorkspacePanels();
  const [onTabs, setOnTabs] = useState(() =>
    typeof window !== 'undefined' &&
    (window.location.pathname === '/tabs' || window.location.pathname.startsWith('/tabs/')),
  );

  useEffect(() => {
    const sync = () => {
      const p = window.location.pathname;
      setOnTabs(p === '/tabs' || p.startsWith('/tabs/'));
    };
    window.addEventListener('popstate', sync);
    window.addEventListener('hanzo:moved', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('hanzo:moved', sync);
    };
  }, []);

  const triggerSplit = (dir: 'row' | 'col') => {
    window.dispatchEvent(new CustomEvent('hanzo:tabs-action', { detail: { kind: 'split', dir } }));
  };

  return (
    <div data-slot="desktop-top-controls" className="hz-top-controls">
      <Update />
      {onTabs ? (
        <>
          <button
            type="button"
            data-slot="tabs-split-vertical"
            className="hz-chrome-btn"
            aria-label="Split vertical (⌘D)"
            title="Split vertical (⌘D)"
            onClick={() => triggerSplit('row')}
          >
            <Columns2 size={15} strokeWidth={1.85} />
          </button>
          <button
            type="button"
            data-slot="tabs-split-horizontal"
            className="hz-chrome-btn"
            aria-label="Split horizontal (⌘⇧D)"
            title="Split horizontal (⌘⇧D)"
            onClick={() => triggerSplit('col')}
          >
            <Rows2 size={15} strokeWidth={1.85} />
          </button>
        </>
      ) : null}
      <button
        type="button"
        data-slot="surface-maximize"
        className={`hz-chrome-btn ${rightOpen ? 'hz-chrome-btn-visible' : 'hz-chrome-btn-hidden'} ${maximized ? 'is-active' : ''}`}
        aria-label={maximized ? 'Restore panel size' : 'Maximize panel'}
        title={maximized ? 'Restore panel size' : 'Maximize panel'}
        tabIndex={rightOpen ? 0 : -1}
        aria-hidden={!rightOpen}
        onClick={toggleMaximized}
      >
        {maximized ? <Minimize2 size={15} strokeWidth={1.85} /> : <Maximize2 size={15} strokeWidth={1.85} />}
      </button>
      <button
        type="button"
        data-slot="thread-details-toggle"
        className={`hz-chrome-btn ${detailsOpen ? 'is-active' : ''}`}
        aria-label="Toggle workspace details"
        aria-pressed={detailsOpen}
        title="Workspace details"
        onClick={toggleDetailsPopover}
      >
        <SquareMenu size={16} strokeWidth={1.85} />
      </button>
      <button
        type="button"
        data-slot="terminal-drawer-toggle"
        className={`hz-chrome-btn ${bottomOpen ? 'is-active' : ''}`}
        aria-label="Toggle terminal drawer"
        aria-pressed={bottomOpen}
        title="Toggle terminal drawer"
        onClick={toggleBottomDrawer}
      >
        <PanelBottom size={16} strokeWidth={1.85} />
      </button>
      <button
        type="button"
        data-slot="desktop-settings-button"
        className="hz-chrome-btn"
        aria-label="Settings (⌘,)"
        title="Settings (⌘,)"
        onClick={() => {
          closeDetailsPopover();
          window.history.pushState(null, '', '/settings');
        }}
      >
        <Settings size={15} strokeWidth={1.85} />
      </button>
      <button
        type="button"
        data-slot="right-surface-toggle"
        className={`hz-chrome-btn ${rightOpen ? 'is-active' : ''}`}
        aria-label="Toggle right panel"
        aria-pressed={rightOpen}
        title="Toggle right panel"
        onClick={toggleRightPanel}
      >
        <PanelRight size={16} strokeWidth={1.85} />
      </button>
    </div>
  );
}

/** Floating workspace details popover anchored below the stationary SquareMenu button. */
export function WorkspaceDetailsPopover({
  onOpenSettings,
}: {
  onOpenSettings: () => void;
}) {
  const { detailsOpen } = useWorkspacePanels();
  const [devOrigin, setDevOrigin] = useState<string | null>(null);
  const [engineModels, setEngineModels] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!detailsOpen) return;
    void invoke<{ id: string; origin: string } | null>('dev_local_runtime')
      .then((r) => setDevOrigin(r?.origin ?? null))
      .catch(() => setDevOrigin(null));
    void fetch('http://127.0.0.1:36900/v1/models')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setEngineModels(Array.isArray(d?.data) ? d.data.length : 0))
      .catch(() => setEngineModels(null));

    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-slot="thread-details-toggle"]')) return;
      if (ref.current && !ref.current.contains(target)) {
        closeDetailsPopover();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDetailsPopover();
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [detailsOpen]);

  if (!detailsOpen) return null;

  return (
    <div ref={ref} data-slot="workspace-details-popover" className="hz-details-popover">
      <div className="hz-details-header">
        <span>Workspace</span>
        <button type="button" className="hz-icon-mini" onClick={closeDetailsPopover} aria-label="Close">
          <X size={13} />
        </button>
      </div>
      <div className="hz-details-row">
        <span className="hz-details-label">Hanzo Dev</span>
        <span className="hz-details-value">
          <span className={`hz-dot ${devOrigin ? 'is-online' : ''}`} />
          {devOrigin ? devOrigin.replace(/^https?:\/\//, '') : 'Offline'}
        </span>
      </div>
      <div className="hz-details-row">
        <span className="hz-details-label">Hanzo Engine</span>
        <span className="hz-details-value">
          <span className={`hz-dot ${engineModels !== null ? 'is-online' : ''}`} />
          {engineModels !== null ? `Local :36900 (${engineModels} models)` : 'Not running'}
        </span>
      </div>
      <div className="hz-details-actions">
        <button
          type="button"
          className="hz-details-action"
          onClick={() => {
            closeDetailsPopover();
            openSurface('device');
          }}
        >
          <Smartphone size={13} />
          Linked devices
        </button>
        <button
          type="button"
          className="hz-details-action"
          onClick={() => {
            closeDetailsPopover();
            onOpenSettings();
          }}
        >
          <Cpu size={13} />
          Settings (⌘,)
        </button>
      </div>
    </div>
  );
}

interface LocalFolder {
  name: string;
  path: string;
}

interface LocalEntry {
  name: string;
  path: string;
  is_dir?: boolean;
  isDir?: boolean;
}

function BrowserSurface({ tab }: { tab: SurfaceTab }) {
  const [url, setUrl] = useState(tab.url ?? 'http://localhost:3000');
  const [activeUrl, setActiveUrl] = useState(tab.url ?? 'http://localhost:3000');
  const [nonce, setNonce] = useState(0);

  const navigate = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
    setUrl(normalized);
    setActiveUrl(normalized);
  };

  return (
    <div className="hz-surface-body">
      <form
        className="hz-surface-toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          navigate(url);
        }}
      >
        <input
          type="text"
          className="hz-surface-input"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://localhost:3000"
          aria-label="Browser URL"
        />
        <button
          type="button"
          className="hz-icon-mini"
          title="Reload"
          onClick={() => setNonce((n) => n + 1)}
        >
          <RefreshCw size={13} />
        </button>
        <button
          type="button"
          className="hz-icon-mini"
          title="Open in system browser"
          onClick={() => void openUrl(activeUrl)}
        >
          <ExternalLink size={13} />
        </button>
      </form>
      <iframe
        key={`${activeUrl}-${nonce}`}
        src={activeUrl}
        title={tab.title}
        className="hz-surface-iframe"
        sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
      />
    </div>
  );
}

function FilesSurface() {
  const [folders, setFolders] = useState<LocalFolder[]>([]);
  const [cwd, setCwd] = useState<string | null>(null);
  const [entries, setEntries] = useState<LocalEntry[]>([]);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void invoke<LocalFolder[]>('local_workspace_discover')
      .then((list) => {
        setFolders(Array.isArray(list) ? list : []);
        if (list?.[0]?.path) setCwd(list[0].path);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!cwd) return;
    setErr(null);
    void invoke<LocalEntry[]>('local_workspace_list', { dirPath: cwd })
      .then((items) => setEntries(Array.isArray(items) ? items : []))
      .catch((e) => setErr(String(e)));
  }, [cwd]);

  const pickFolder = async () => {
    try {
      const picked = await invoke<string | null>('local_workspace_open_dialog');
      if (picked) {
        setCwd(picked);
        setFilePath(null);
      }
    } catch (e) {
      setErr(String(e));
    }
  };

  const openEntry = async (entry: LocalEntry) => {
    const isDir = Boolean(entry.is_dir ?? entry.isDir);
    if (isDir) {
      setCwd(entry.path);
      setFilePath(null);
      return;
    }
    try {
      const content = await invoke<string>('local_workspace_read_file', { filePath: entry.path });
      setFilePath(entry.path);
      setFileContent(content);
    } catch (e) {
      setErr(String(e));
    }
  };

  return (
    <div className="hz-surface-body">
      <div className="hz-surface-toolbar">
        <span className="hz-surface-path" title={cwd ?? ''}>
          {cwd ? cwd.split('/').slice(-2).join('/') : 'Select a folder'}
        </span>
        <button type="button" className="hz-pill-btn" onClick={() => void pickFolder()}>
          Open folder
        </button>
      </div>
      {err ? <div className="hz-surface-note">{err}</div> : null}
      {filePath ? (
        <div className="hz-file-viewer">
          <div className="hz-file-viewer-head">
            <span>{filePath.split('/').pop()}</span>
            <button type="button" className="hz-pill-btn" onClick={() => setFilePath(null)}>
              Back
            </button>
          </div>
          <pre className="hz-file-code">{fileContent.slice(0, 40000)}</pre>
        </div>
      ) : (
        <div className="hz-surface-list hz-unix-files">
          {cwd && cwd.includes('/') && cwd !== '/' ? (
            <button
              type="button"
              className="hz-list-row hz-file-row hz-file-parent"
              onClick={() => {
                const parent = cwd.slice(0, cwd.lastIndexOf('/')) || '/';
                setCwd(parent);
                setFilePath(null);
              }}
            >
              <Folder size={14} style={{ color: '#38bdf8', flexShrink: 0 }} />
              <span className="hz-file-name" style={{ color: '#7dd3fc' }}>../</span>
            </button>
          ) : null}
          {!cwd && folders.length > 0
            ? folders.map((f) => (
                <button key={f.path} type="button" className="hz-list-row hz-file-row" onClick={() => setCwd(f.path)}>
                  <Folder size={14} style={{ color: '#38bdf8', flexShrink: 0 }} />
                  <span className="hz-file-name" style={{ color: '#e0f2fe' }}>{f.name}/</span>
                </button>
              ))
            : null}
          {entries.map((entry) => {
            const isDir = Boolean(entry.is_dir ?? entry.isDir);
            const { Icon, color, nameColor } = getFileVisual(entry.name, isDir);
            return (
              <button
                key={entry.path}
                type="button"
                className="hz-list-row hz-file-row"
                onClick={() => void openEntry(entry)}
              >
                <Icon size={14} strokeWidth={1.85} style={{ color, flexShrink: 0 }} />
                <span className="hz-file-name" style={{ color: nameColor }}>
                  {entry.name}
                  {isDir ? '/' : ''}
                </span>
              </button>
            );
          })}
          {cwd && entries.length === 0 && !err ? (
            <div className="hz-surface-note">Empty folder.</div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function DeviceSurface() {
  const [localDev, setLocalDev] = useState<{ id: string; origin: string } | null>(null);
  const [machines, setMachines] = useState<Array<{ id?: string; name?: string; status?: string; kind?: string }>>([]);
  const [engineOnline, setEngineOnline] = useState(false);

  const refresh = () => {
    void invoke<{ id: string; origin: string } | null>('dev_local_runtime')
      .then(setLocalDev)
      .catch(() => setLocalDev(null));
    void invoke<Array<{ id?: string; name?: string; status?: string; kind?: string }>>('machine_list')
      .then((list) => setMachines(Array.isArray(list) ? list : []))
      .catch(() => setMachines([]));
    void fetch('http://127.0.0.1:36900/v1/models')
      .then((r) => setEngineOnline(r.ok))
      .catch(() => setEngineOnline(false));
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="hz-surface-body hz-surface-pad">
      <div className="hz-device-section">
        <div className="hz-device-title">
          <span>This machine</span>
          <button type="button" className="hz-icon-mini" onClick={refresh} title="Refresh">
            <RefreshCw size={13} />
          </button>
        </div>
        <div className="hz-device-card">
          <div className="hz-device-row">
            <span>Hanzo Dev Server</span>
            <span className="hz-details-value">
              <span className={`hz-dot ${localDev ? 'is-online' : ''}`} />
              {localDev ? localDev.origin.replace(/^https?:\/\//, '') : 'Offline'}
            </span>
          </div>
          <div className="hz-device-row">
            <span>Hanzo Engine (local)</span>
            <span className="hz-details-value">
              <span className={`hz-dot ${engineOnline ? 'is-online' : ''}`} />
              {engineOnline ? '127.0.0.1:36900' : 'Not started'}
            </span>
          </div>
        </div>
      </div>

      {machines.length > 0 ? (
        <div className="hz-device-section">
          <div className="hz-device-title">
            <span>Linked devices</span>
          </div>
          <div className="hz-device-card">
            {machines.map((m, i) => (
              <div key={m.id ?? i} className="hz-device-row">
                <span>{m.name ?? m.id ?? 'Machine'}</span>
                <span className="hz-details-value">
                  <span className={`hz-dot ${m.status === 'online' ? 'is-online' : ''}`} />
                  {m.status ?? 'linked'}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="hz-device-section">
        <div className="hz-device-title">
          <span>Mobile & Cloud</span>
        </div>
        <div className="hz-device-card">
          <p className="hz-device-copy">
            Sign in with the same Hanzo account on Desktop, Mobile (iOS/Android), and Chrome to sync threads and link devices.
          </p>
          <div className="hz-device-buttons">
            <button
              type="button"
              className="hz-pill-btn"
              onClick={() => void openUrl('https://hanzo.ai/download')}
            >
              Get Hanzo Mobile
            </button>
            <button
              type="button"
              className="hz-pill-btn"
              onClick={() => void openUrl('https://hanzo.app')}
            >
              Open hanzo.app
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SideChatSurface() {
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    const next = [...messages, { role: 'user' as const, content: text }];
    setMessages(next);
    setDraft('');
    setBusy(true);
    try {
      const res = await fetch('/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'zen6', messages: next, stream: false }),
      });
      const data = await res.json().catch(() => null);
      const reply =
        data?.choices?.[0]?.message?.content ??
        data?.error?.message ??
        'No response from model.';
      setMessages([...next, { role: 'assistant', content: String(reply) }]);
    } catch (e) {
      setMessages([...next, { role: 'assistant', content: `Request failed: ${String(e)}` }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="hz-surface-body">
      <div className="hz-sidechat-messages">
        {messages.length === 0 ? (
          <div className="hz-surface-note">Quick side chat alongside your main workspace.</div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`hz-sidechat-msg is-${m.role}`}>
              {m.content}
            </div>
          ))
        )}
      </div>
      <form
        className="hz-sidechat-form"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          type="text"
          className="hz-surface-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask in side chat…"
          disabled={busy}
        />
        <button type="submit" className="hz-icon-mini" disabled={busy || !draft.trim()} aria-label="Send">
          <Send size={13} />
        </button>
      </form>
    </div>
  );
}

function TerminalSurface() {
  return (
    <div className="hz-surface-body hz-surface-pad">
      <div className="hz-device-card">
        <div className="hz-device-row">
          <span>Workspace Terminal</span>
          <button
            type="button"
            className="hz-pill-btn"
            onClick={() => {
              window.history.pushState(null, '', '/tabs');
            }}
          >
            Open full Tabs
          </button>
        </div>
        <p className="hz-device-copy">
          Connects to your local Hanzo Dev runtime or linked machine sessions. Open Tabs for full interactive PTY panes.
        </p>
      </div>
    </div>
  );
}

function ContextSurface({ kind }: { kind: 'diff' | 'pr' | 'linked' }) {
  const copy =
    kind === 'diff'
      ? 'Open a repository thread in Dev to inspect live git diffs and staged hunks.'
      : kind === 'pr'
        ? 'Open a repository thread in Dev to review pull requests, CI checks, and comments.'
        : 'Linked issues, commits, and docs from the active thread appear here.';
  return (
    <div className="hz-surface-body hz-surface-pad">
      <div className="hz-device-card">
        <p className="hz-device-copy">{copy}</p>
        <button
          type="button"
          className="hz-pill-btn"
          onClick={() => window.history.pushState(null, '', '/dev')}
        >
          Switch to Dev
        </button>
      </div>
    </div>
  );
}

export function SurfacePanel() {
  const { rightOpen, maximized, width, tabs, activeTabId } = useWorkspacePanels();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const launcherRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  if (!rightOpen) return null;

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

  const onResizeStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;
    const onMove = (ev: PointerEvent) => {
      setSurfaceWidth(startWidth + (startX - ev.clientX));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const handleLauncherKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key.toUpperCase();
    const match = SURFACES.find((s) => s.shortcut === key);
    if (match) {
      e.preventDefault();
      openSurface(match.kind);
    }
  };

  return (
    <aside
      data-slot="desktop-surface-panel"
      className={`hz-surface-panel ${maximized ? 'is-maximized' : ''}`}
      style={maximized ? undefined : { width }}
    >
      {!maximized ? (
        <div
          className="hz-surface-resizer"
          onPointerDown={onResizeStart}
          title="Drag to resize panel"
        />
      ) : null}

      {/* Top strip — NO bottom underline; leaves room on right for fixed TopRightControls */}
      <div data-slot="surface-strip" className="hz-surface-strip">
        <div ref={menuRef} className="hz-surface-add-wrap">
          <button
            type="button"
            data-slot="surface-add-btn"
            className={`hz-surface-add-btn ${menuOpen ? 'is-open' : ''}`}
            aria-label="Open a surface"
            aria-expanded={menuOpen}
            title="Open a surface"
            onClick={() => setMenuOpen((o) => !o)}
          >
            <Plus size={15} strokeWidth={1.85} />
          </button>

          {menuOpen ? (
            <div data-slot="surface-add-menu" className="hz-surface-menu" role="menu">
              {SURFACES.map((surface) => {
                const Icon = surface.icon;
                return (
                  <button
                    key={surface.kind}
                    type="button"
                    role="menuitem"
                    className="hz-surface-menu-item"
                    onClick={() => {
                      setMenuOpen(false);
                      openSurface(surface.kind);
                    }}
                  >
                    <Icon size={15} strokeWidth={1.75} className="hz-surface-item-icon" />
                    <span className="hz-surface-item-label">{surface.label}</span>
                    <span className="hz-surface-item-kbd">{surface.shortcut}</span>
                    {surface.hasSubmenu ? (
                      <ChevronRight size={13} className="hz-surface-item-chevron" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        <div className="hz-surface-tabs">
          {tabs.map((tab) => {
            const Icon = SURFACES.find((s) => s.kind === tab.kind)?.icon ?? Globe;
            const active = tab.id === activeTab?.id;
            return (
              <div
                key={tab.id}
                className={`hz-surface-tab ${active ? 'is-active' : ''}`}
                onClick={() => selectSurfaceTab(tab.id)}
                role="tab"
                aria-selected={active}
              >
                <Icon size={13} strokeWidth={1.75} />
                <span className="hz-surface-tab-title">{tab.title}</span>
                <button
                  type="button"
                  className="hz-surface-tab-close"
                  aria-label={`Close ${tab.title}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeSurfaceTab(tab.id);
                  }}
                >
                  <X size={11} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {!activeTab ? (
        <div
          ref={launcherRef}
          tabIndex={0}
          onKeyDown={handleLauncherKeyDown}
          data-slot="surface-launcher"
          className="hz-surface-launcher"
        >
          <div className="hz-launcher-inner">
            <h3 className="hz-launcher-title">Open a surface</h3>
            <div className="hz-launcher-list">
              {SURFACES.map((surface) => {
                const Icon = surface.icon;
                return (
                  <button
                    key={surface.kind}
                    type="button"
                    className="hz-launcher-row"
                    onClick={() => openSurface(surface.kind)}
                  >
                    <Icon size={16} strokeWidth={1.75} className="hz-surface-item-icon" />
                    <span className="hz-surface-item-label">{surface.label}</span>
                    <kbd className="hz-launcher-kbd">{surface.shortcut}</kbd>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : activeTab.kind === 'browser' ? (
        <BrowserSurface tab={activeTab} />
      ) : activeTab.kind === 'files' ? (
        <FilesSurface />
      ) : activeTab.kind === 'device' ? (
        <DeviceSurface />
      ) : activeTab.kind === 'chat' ? (
        <SideChatSurface />
      ) : activeTab.kind === 'terminal' ? (
        <TerminalSurface />
      ) : (
        <ContextSurface kind={activeTab.kind} />
      )}
    </aside>
  );
}

export function BottomTerminalDrawer() {
  const { bottomOpen } = useWorkspacePanels();
  if (!bottomOpen) return null;

  return (
    <div data-slot="desktop-bottom-drawer" className="hz-bottom-drawer">
      <div className="hz-bottom-drawer-head">
        <div className="hz-bottom-drawer-title">
          <SquareTerminal size={14} />
          <span>Terminal</span>
        </div>
        <div className="hz-bottom-drawer-actions">
          <button
            type="button"
            className="hz-pill-btn"
            onClick={() => window.history.pushState(null, '', '/tabs')}
          >
            Open Tabs
          </button>
          <button
            type="button"
            className="hz-icon-mini"
            aria-label="Close terminal drawer"
            onClick={toggleBottomDrawer}
          >
            <X size={13} />
          </button>
        </div>
      </div>
      <div className="hz-bottom-drawer-body">
        Connected to local workspace. Launch a full terminal session in Tabs or open a Dev thread.
      </div>
    </div>
  );
}
