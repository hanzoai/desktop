import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getBrand } from '@hanzo/desktop-brand-config';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { HanzoMark } from '@hanzogui/shell';
import { keychain } from './keychain';
import { CodeFileViewer } from './lib/CodeFileViewer';
import { getFileVisual } from './lib/file-style';
import { safeInvoke } from './utils/tauri-check';
import {
  SiAnthropic,
  SiApple,
  SiAtlassian,
  SiDiscord,
  SiDropbox,
  SiGithub,
  SiGmail,
  SiGooglecalendar,
  SiGooglechrome,
  SiGoogledrive,
  SiGooglegemini,
  SiHubspot,
  SiLinear,
  SiNotion,
  SiOllama,
  SiPubmed,
  SiShopify,
  SiSupabase,
  SiTelegram,
  SiVercel,
  SiWhatsapp,
  SiX,
  SiZoom,
} from '@icons-pack/react-simple-icons';
import {
  BadgeCheck,
  Blocks,
  Briefcase,
  Check,
  ChevronDown,
  Code2,
  Compass,
  Database,
  FileText,
  Flame,
  Folder,
  FolderOpen,
  Globe,
  Image as ImageIcon,
  KeyRound,
  Layers,
  Link2,
  MessageSquare,
  NotebookPen,
  Palette,
  Pencil,
  PieChart,
  Plug,
  Plus,
  Radar,
  Radio,
  RefreshCw,
  Scale,
  Search,
  Sparkles,
  Terminal,
  Upload,
  X,
} from 'lucide-react';

/* ============================================================================
 * Crisp Authentic Brand Icons (Official SVGs + Simple Icons + HanzoMark)
 * ============================================================================ */

function FigmaBrandIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 38 57" fill="none" aria-hidden="true">
      <path d="M19 28.5A9.5 9.5 0 1 1 28.5 19 9.5 9.5 0 0 1 19 28.5Z" fill="#1ABCFE" />
      <path d="M9.5 47.5A9.5 9.5 0 0 1 19 38v9.5a9.5 9.5 0 0 1-9.5 0Z" fill="#0ACF83" />
      <path d="M19 0v19h9.5a9.5 9.5 0 1 0 0-19H19Z" fill="#FF7262" />
      <path d="M0 9.5A9.5 9.5 0 0 0 9.5 19H19V0H9.5A9.5 9.5 0 0 0 0 9.5Z" fill="#F24E1E" />
      <path d="M0 28.5A9.5 9.5 0 0 0 9.5 38H19V19H9.5A9.5 9.5 0 0 0 0 28.5Z" fill="#A259FF" />
    </svg>
  );
}

function SlackBrandIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 15a2 2 0 1 1-2-2h2v2Zm1 0a2 2 0 1 1 4 0v5a2 2 0 1 1-4 0v-5Z" fill="#E01E5A" />
      <path d="M9 6a2 2 0 1 1 2-2v2H9Zm0 1a2 2 0 1 1 0 4H4a2 2 0 1 1 0-4h5Z" fill="#36C5F0" />
      <path d="M18 9a2 2 0 1 1 2 2h-2V9Zm-1 0a2 2 0 1 1-4 0V4a2 2 0 1 1 4 0v5Z" fill="#2EB67D" />
      <path d="M15 18a2 2 0 1 1-2 2v-2h2Zm0-1a2 2 0 1 1 0-4h5a2 2 0 1 1 0 4h-5Z" fill="#ECB22E" />
    </svg>
  );
}

function MicrosoftBrandIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 21 21" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}

function CanvaBrandIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="hz-canva-g" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#00C4CC" />
          <stop offset="100%" stopColor="#7D2AE8" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="11" fill="url(#hz-canva-g)" />
      <path
        d="M15.4 14.3c-.7 1.3-2 2.2-3.5 2.2-2.2 0-3.7-1.8-3.7-4.3 0-2.8 1.8-4.7 4-4.7 1.2 0 2.2.6 2.6 1.6.1.3 0 .6-.3.7-.3.1-.6 0-.8-.3-.3-.6-.9-.9-1.5-.9-1.5 0-2.6 1.5-2.6 3.6 0 1.9 1 3.1 2.4 3.1 1 0 1.8-.6 2.3-1.5.2-.3.5-.4.8-.2.3.1.4.5.3.7Z"
        fill="#fff"
      />
    </svg>
  );
}

function OpenAIBrandIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073ZM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494ZM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646ZM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.896Zm16.597 3.855-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667Zm2.01-3.023-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66Zm-12.64 4.135-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681Zm1.097-2.365 2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5Z" />
    </svg>
  );
}

function PluginIcon({ id }: { id: string }): ReactNode {
  switch (id) {
    case 'hanzo':
      return <HanzoMark size={17} />;
    case 'chrome':
      return <SiGooglechrome size={18} color="#4285F4" />;
    case 'notion':
      return <SiNotion size={18} color="#ffffff" />;
    case 'linear':
      return <SiLinear size={18} color="#5E6AD2" />;
    case 'github':
      return <SiGithub size={18} color="#ffffff" />;
    case 'figma':
      return <FigmaBrandIcon />;
    case 'canva':
      return <CanvaBrandIcon />;
    case 'google-drive':
      return <SiGoogledrive size={18} color="#4285F4" />;
    case 'gmail':
      return <SiGmail size={18} color="#EA4335" />;
    case 'google-calendar':
      return <SiGooglecalendar size={18} color="#4285F4" />;
    case 'microsoft-365':
      return <MicrosoftBrandIcon />;
    case 'atlassian':
      return <SiAtlassian size={18} color="#2684FF" />;
    case 'supabase':
      return <SiSupabase size={18} color="#3ECF8E" />;
    case 'vercel':
      return <SiVercel size={15} color="#ffffff" />;
    case 'hubspot':
      return <SiHubspot size={18} color="#FF7A59" />;
    case 'shopify':
      return <SiShopify size={18} color="#95BF47" />;
    case 'firecrawl':
      return <Flame size={18} color="#FF6B2C" />;
    case 'exa':
      return <Radar size={18} color="#818CF8" />;
    case 'granola':
      return <NotebookPen size={17} color="#F59E0B" />;
    case 'dropbox':
      return <SiDropbox size={18} color="#0061FF" />;
    case 'pubmed':
      return <SiPubmed size={18} color="#4B8BBE" />;
    case 'channel-slack':
      return <SlackBrandIcon />;
    case 'channel-discord':
      return <SiDiscord size={18} color="#5865F2" />;
    case 'channel-telegram':
      return <SiTelegram size={18} color="#26A5E4" />;
    case 'channel-whatsapp':
      return <SiWhatsapp size={18} color="#25D366" />;
    case 'channel-imessage':
      return <SiApple size={17} color="#ffffff" />;
    case 'channel-zoom':
      return <SiZoom size={18} color="#2D8CFF" />;
    case 'skill-superpowers':
      return <Code2 size={17} color="#e5e5e5" />;
    case 'skill-frontend-design':
      return <Palette size={17} color="#e5e5e5" />;
    case 'skill-engineering':
      return <Terminal size={17} color="#e5e5e5" />;
    case 'skill-product':
      return <Compass size={17} color="#e5e5e5" />;
    case 'skill-sales':
      return <Briefcase size={17} color="#e5e5e5" />;
    case 'skill-data':
      return <Database size={17} color="#e5e5e5" />;
    case 'skill-carta':
      return <PieChart size={17} color="#e5e5e5" />;
    case 'skill-legal':
      return <Scale size={17} color="#e5e5e5" />;
    case 'anthropic':
      return <SiAnthropic size={17} color="#D97757" />;
    case 'openai':
      return <OpenAIBrandIcon />;
    case 'google':
      return <SiGooglegemini size={18} color="#4285F4" />;
    case 'xai':
      return <SiX size={16} color="#ffffff" />;
    case 'deepseek':
      return <Sparkles size={17} color="#60A5FA" />;
    case 'ollama':
      return <SiOllama size={18} color="#ffffff" />;
    default:
      return <Plug size={16} />;
  }
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

const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg|avif)$/i;

/**
 * Working Library surface for Hanzo Desktop (`/library` and `/dev/-/artifacts`).
 */
export function LibraryOverlay({ onClose: _onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'all' | 'images' | 'files'>('all');
  const [folders, setFolders] = useState<LocalFolder[]>([]);
  const [cwd, setCwd] = useState<string | null>(null);
  const [entries, setEntries] = useState<LocalEntry[]>([]);
  const [selectedFile, setSelectedFile] = useState<{ path: string; content: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const loadFolders = () => {
    void invoke<LocalFolder[]>('local_workspace_discover')
      .then((list) => {
        const items = Array.isArray(list) ? list : [];
        setFolders(items);
        if (!cwd && items[0]?.path) setCwd(items[0].path);
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadFolders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!cwd) return;
    setLoading(true);
    void invoke<LocalEntry[]>('local_workspace_list', { dirPath: cwd })
      .then((items) => setEntries(Array.isArray(items) ? items : []))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [cwd]);

  const pickFolder = async () => {
    try {
      const picked = await invoke<string | null>('local_workspace_open_dialog');
      if (picked) {
        setCwd(picked);
        setSelectedFile(null);
      }
    } catch {
      // cancelled
    }
  };

  const openEntry = async (entry: LocalEntry) => {
    const isDir = Boolean(entry.is_dir ?? entry.isDir);
    if (isDir) {
      setCwd(entry.path);
      setSelectedFile(null);
      return;
    }
    try {
      const content = await invoke<string>('local_workspace_read_file', { filePath: entry.path });
      setSelectedFile({ path: entry.path, content });
    } catch {
      // binary or unreadable
    }
  };

  const filtered = entries.filter((e) => {
    const isDir = Boolean(e.is_dir ?? e.isDir);
    if (tab === 'images') return !isDir && IMAGE_RE.test(e.name);
    if (tab === 'files') return !isDir && !IMAGE_RE.test(e.name);
    return true;
  });

  return (
    <div data-slot="desktop-library-pane" className="hz-library-room">
      <div className="hz-overlay-header hz-library-header">
        <div className="hz-overlay-title-row">
          <h2>Library</h2>
          <Layers size={15} style={{ color: '#888888' }} />
        </div>
        <div className="hz-overlay-tabs">
          {(['all', 'files', 'images'] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={`hz-overlay-tab ${tab === t ? 'is-active' : ''}`}
              onClick={() => setTab(t)}
            >
              {t === 'all' ? 'All' : t === 'files' ? 'Files' : 'Images'}
            </button>
          ))}
        </div>
        <div className="hz-overlay-actions">
          <button type="button" className="hz-pill-btn" onClick={() => void pickFolder()}>
            <FolderOpen size={13} />
            Open folder
          </button>
        </div>
      </div>

      <div className="hz-library-layout">
        <div className="hz-library-folders">
          <div className="hz-device-title">
            <span>Workspaces</span>
            <button type="button" className="hz-icon-mini" onClick={loadFolders} title="Refresh">
              <RefreshCw size={12} />
            </button>
          </div>
          {folders.length === 0 ? (
            <div className="hz-surface-note">No folders discovered yet. Click Open folder above.</div>
          ) : (
            folders.map((f) => (
              <button
                key={f.path}
                type="button"
                className={`hz-list-row hz-file-row ${cwd === f.path ? 'is-selected' : ''}`}
                onClick={() => {
                  setCwd(f.path);
                  setSelectedFile(null);
                }}
              >
                <Folder size={14} style={{ color: '#38bdf8', flexShrink: 0 }} />
                <span className="hz-file-name" style={{ color: cwd === f.path ? '#ffffff' : '#bae6fd' }}>
                  {f.name}
                </span>
              </button>
            ))
          )}
        </div>

        <div className="hz-library-content">
          {cwd ? (
            <div className="hz-library-breadcrumb">
              <span>{cwd}</span>
              {cwd.includes('/') && cwd !== '/' ? (
                <button
                  type="button"
                  className="hz-pill-btn"
                  onClick={() => {
                    const parent = cwd.slice(0, cwd.lastIndexOf('/')) || '/';
                    setCwd(parent);
                    setSelectedFile(null);
                  }}
                >
                  Up
                </button>
              ) : null}
            </div>
          ) : null}

          {selectedFile ? (
            <CodeFileViewer
              filePath={selectedFile.path}
              content={selectedFile.content}
              onBack={() => setSelectedFile(null)}
              backLabel="Back to list"
            />
          ) : loading ? (
            <div className="hz-surface-note">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="hz-surface-note">No items in this view.</div>
          ) : (
            <div className="hz-library-grid">
              {filtered.map((entry) => {
                const isDir = Boolean(entry.is_dir ?? entry.isDir);
                const { Icon, color, nameColor } = getFileVisual(entry.name, isDir);
                return (
                  <button
                    key={entry.path}
                    type="button"
                    className="hz-library-card"
                    onClick={() => void openEntry(entry)}
                  >
                    <Icon size={17} strokeWidth={1.85} style={{ color, flexShrink: 0 }} />
                    <span className="hz-library-card-name" style={{ color: nameColor }}>
                      {entry.name}
                      {isDir ? '/' : ''}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
 * Plugins Directory — Real Connectors, Channels, MCP Servers & Skills
 * Backed by:
 *   - GET/POST/DELETE /v1/tools/mcp/servers & GET /v1/tools/catalog (MCP)
 *   - GET /v1/connection, GET /v1/connection/providers, POST /v1/connection/:id/device, DELETE /v1/connection/:id
 *   - GET /v1/provider, POST /v1/provider/:id/connect, POST /v1/provider/:id/disconnect (Channels)
 *   - GET /v1/tools/skills & PUT /v1/tools/activation (Org Skills)
 *   - Native ZAP Tauri IPC (`zap_nodes`, `browsers`) for local extensions
 * ============================================================================ */

type PluginKind = 'connector' | 'channel' | 'skill';

interface McpServerRow {
  id: string;
  name: string;
  url?: string;
  listing?: string;
  transport?: string;
  status?: string;
}

interface CatalogListing {
  id: string;
  name?: string;
  title?: string;
  vendor?: string;
  description?: string;
  logo?: string;
  transports?: string[];
  packages?: Array<{ registry?: string }>;
}

interface ConnectionRecord {
  provider: string;
  account?: string;
  label?: string;
  status?: string;
}

interface ConnectionProvider {
  id: string;
  name: string;
  description: string;
  category: string;
  methods: string[];
}

interface ChannelRow {
  id: string;
  name: string;
  description: string;
  category: string;
  connected: boolean;
  available: boolean;
  account: string;
}

interface SkillRow {
  name: string;
  description: string;
  activated: boolean;
}

interface ZapBrowserRow {
  id?: string;
  name?: string;
  browser?: string;
  version?: string;
}

interface DeviceFlowPrompt {
  provider: string;
  name: string;
  userCode: string;
  verifyUrl: string;
}

const CATALOG_PLUMBING = new Set(['mcp', 'www', 'api', 'app', 'cloud', 'io', 'server']);

function catalogLabel(listing: CatalogListing): string {
  if (listing.title) return listing.title;
  const vendorBrand = (listing.vendor ?? '')
    .split('.')
    .reverse()
    .find((part) => part && !CATALOG_PLUMBING.has(part));
  if (vendorBrand) return vendorBrand.charAt(0).toUpperCase() + vendorBrand.slice(1);
  return listing.name?.split('/').pop() || listing.id;
}

function isCatalogReachable(listing: CatalogListing): boolean {
  return (listing.transports ?? []).includes('streamable-http');
}

function platformApiBase(): string {
  if (import.meta.env.DEV) return window.location.origin;
  return getBrand().cloudApi.replace(/\/+$/, '');
}

function platformAuthHeaders(): Record<string, string> | null {
  const token = keychain.getItem('hanzo_iam_access_token');
  if (!token) return null;
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  try {
    const org = window.localStorage.getItem('hanzo_iam_current_org');
    if (org) headers['X-Org-Id'] = org;
  } catch {
    // ignore storage errors
  }
  return headers;
}

export function PluginsDirectoryOverlay({
  onClose,
  onSignIn,
}: {
  onClose: () => void;
  onSignIn?: () => void;
}) {
  const [filter, setFilter] = useState<'all' | PluginKind>('all');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [devicePrompt, setDevicePrompt] = useState<DeviceFlowPrompt | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  // Real live state from backend + native ZAP
  const [signedIn, setSignedIn] = useState(() => Boolean(platformAuthHeaders()));
  const [zapNodes, setZapNodes] = useState<Array<{ id: string; caps: string[] }>>([]);
  const [zapBrowsers, setZapBrowsers] = useState<ZapBrowserRow[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServerRow[]>([]);
  const [catalog, setCatalog] = useState<CatalogListing[]>([]);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [connections, setConnections] = useState<ConnectionRecord[]>([]);
  const [connProviders, setConnProviders] = useState<ConnectionProvider[]>([]);
  const [channels, setChannels] = useState<ChannelRow[]>([]);
  const [skills, setSkills] = useState<SkillRow[]>([]);

  // Custom MCP server form
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [addingCustom, setAddingCustom] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customEndpoint, setCustomEndpoint] = useState('');
  const addMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 220);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!addMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setAddMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [addMenuOpen]);

  const loadAll = useCallback(async (searchTerm: string) => {
    setErrorMsg(null);
    const [nodesRes, browsersRes] = await Promise.all([
      safeInvoke<Array<{ id: string; caps: string[] }>>('zap_nodes').catch(() => []),
      safeInvoke<ZapBrowserRow[]>('browsers').catch(() => []),
    ]);
    setZapNodes(Array.isArray(nodesRes) ? nodesRes : []);
    setZapBrowsers(Array.isArray(browsersRes) ? browsersRes : []);

    const headers = platformAuthHeaders();
    setSignedIn(Boolean(headers));
    if (!headers) {
      setMcpServers([]);
      setConnections([]);
      setConnProviders([]);
      setChannels([]);
      setSkills([]);
      setCatalog([]);
      setCatalogTotal(0);
      setLoading(false);
      return;
    }

    const base = platformApiBase();
    const fetchJson = async (path: string) => {
      try {
        const r = await fetch(`${base}${path}`, { headers });
        if (!r.ok) return null;
        return await r.json();
      } catch {
        return null;
      }
    };

    const catParams = new URLSearchParams();
    if (searchTerm) {
      catParams.set('q', searchTerm);
    } else {
      catParams.set('featured', 'true');
    }
    catParams.set('limit', '60');

    const [mcpJson, connJson, connProvJson, chanJson, skillsJson, catJson] = await Promise.all([
      fetchJson('/v1/tools/mcp/servers'),
      fetchJson('/v1/connection'),
      fetchJson('/v1/connection/providers'),
      fetchJson('/v1/provider'),
      fetchJson('/v1/tools/skills'),
      fetchJson(`/v1/tools/catalog?${catParams.toString()}`),
    ]);

    const rawServers = Array.isArray(mcpJson?.servers)
      ? mcpJson.servers
      : Array.isArray(mcpJson)
        ? mcpJson
        : [];
    setMcpServers(
      rawServers.map((s: Record<string, unknown>) => ({
        id: String(s.id ?? s.name ?? ''),
        name: String(s.name ?? s.id ?? 'MCP Server'),
        url: typeof s.url === 'string' ? s.url : undefined,
        listing: typeof s.listing === 'string' ? s.listing : undefined,
        transport: typeof s.transport === 'string' ? s.transport : undefined,
        status: typeof s.status === 'string' ? s.status : undefined,
      })),
    );

    const rawConns = Array.isArray(connJson?.connectors) ? connJson.connectors : [];
    setConnections(
      rawConns.map((c: Record<string, unknown>) => ({
        provider: String(c.provider ?? c.id ?? ''),
        account: typeof c.account === 'string' ? c.account : undefined,
        label: typeof c.label === 'string' ? c.label : undefined,
        status: typeof c.status === 'string' ? c.status : undefined,
      })),
    );

    const rawProv = Array.isArray(connProvJson?.providers) ? connProvJson.providers : [];
    setConnProviders(
      rawProv.map((p: Record<string, unknown>) => ({
        id: String(p.id ?? ''),
        name: String(p.name ?? p.id ?? ''),
        description: String(p.description ?? ''),
        category: String(p.category ?? 'Connector'),
        methods: Array.isArray(p.methods) ? p.methods.map(String) : [],
      })),
    );

    const rawChans = Array.isArray(chanJson?.providers) ? chanJson.providers : [];
    setChannels(
      rawChans.map((p: Record<string, unknown>) => {
        const link = (p.connection ?? {}) as Record<string, unknown>;
        return {
          id: String(p.id ?? ''),
          name: String(p.name ?? p.id ?? ''),
          description: String(p.description ?? ''),
          category: String(p.category ?? 'Channel'),
          connected: Boolean(p.connected),
          available: Boolean(p.available),
          account: String(link.account ?? link.label ?? ''),
        };
      }),
    );

    const rawSkills = Array.isArray(skillsJson?.tools) ? skillsJson.tools : [];
    setSkills(
      rawSkills.map((t: Record<string, unknown>) => ({
        name: String(t.name ?? ''),
        description: String(t.description ?? ''),
        activated: t.activated === true,
      })),
    );

    const rawCat = Array.isArray(catJson?.catalog) ? catJson.catalog : [];
    setCatalog(rawCat as CatalogListing[]);
    setCatalogTotal(typeof catJson?.total === 'number' ? catJson.total : rawCat.length);
    setLoading(false);
  }, []);

  useEffect(() => {
    setLoading(true);
    void loadAll(debouncedQuery);
  }, [loadAll, debouncedQuery]);

  // Refresh real connection state whenever user returns from browser OAuth/device flow
  useEffect(() => {
    const onReturn = () => {
      if (document.visibilityState === 'visible') {
        void loadAll(debouncedQuery);
      }
    };
    const onFocus = () => void loadAll(debouncedQuery);
    document.addEventListener('visibilitychange', onReturn);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onReturn);
      window.removeEventListener('focus', onFocus);
    };
  }, [loadAll, debouncedQuery]);

  const installedListingIds = useMemo(
    () => new Set(mcpServers.map((s) => s.listing).filter((x): x is string => Boolean(x))),
    [mcpServers],
  );
  const connectedProviderIds = useMemo(
    () => new Set(connections.map((c) => c.provider)),
    [connections],
  );

  const installCatalogMcp = async (listing: CatalogListing) => {
    const headers = platformAuthHeaders();
    if (!headers) {
      onSignIn?.();
      return;
    }
    setBusyKey(`mcp:${listing.id}`);
    setErrorMsg(null);
    try {
      const r = await fetch(`${platformApiBase()}/v1/tools/mcp/servers`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing: listing.id }),
      });
      if (!r.ok) {
        const text = await r.text().catch(() => '');
        throw new Error(text || `Install failed (${r.status})`);
      }
      await loadAll(debouncedQuery);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyKey(null);
    }
  };

  const removeMcpServer = async (id: string) => {
    const headers = platformAuthHeaders();
    if (!headers) return;
    setBusyKey(`rm-mcp:${id}`);
    setErrorMsg(null);
    try {
      const r = await fetch(`${platformApiBase()}/v1/tools/mcp/servers/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers,
      });
      if (!r.ok) throw new Error(`Disconnect failed (${r.status})`);
      await loadAll(debouncedQuery);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyKey(null);
    }
  };

  const saveCustomMcp = async () => {
    const name = customName.trim();
    const endpoint = customEndpoint.trim();
    if (!name || !endpoint) return;
    const headers = platformAuthHeaders();
    if (!headers) {
      onSignIn?.();
      return;
    }
    setBusyKey('custom-mcp');
    setErrorMsg(null);
    try {
      const isHttp = /^https?:\/\//i.test(endpoint);
      const body = isHttp
        ? { name, url: endpoint }
        : { name, command: endpoint.split(/\s+/)[0], args: endpoint.split(/\s+/).slice(1) };
      const r = await fetch(`${platformApiBase()}/v1/tools/mcp/servers`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const text = await r.text().catch(() => '');
        throw new Error(text || `Could not add MCP server (${r.status})`);
      }
      setCustomName('');
      setCustomEndpoint('');
      setAddingCustom(false);
      await loadAll(debouncedQuery);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyKey(null);
    }
  };

  const connectOAuthProvider = async (prov: ConnectionProvider) => {
    const headers = platformAuthHeaders();
    if (!headers) {
      onSignIn?.();
      return;
    }
    setBusyKey(`conn:${prov.id}`);
    setErrorMsg(null);
    try {
      const r = await fetch(`${platformApiBase()}/v1/connection/${encodeURIComponent(prov.id)}/device`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!r.ok) {
        const text = await r.text().catch(() => '');
        throw new Error(text || `Could not start ${prov.name} sign-in (${r.status})`);
      }
      const data = (await r.json()) as { userCode?: string; verifyUrl?: string; authorizeUrl?: string };
      const targetUrl = data.verifyUrl || data.authorizeUrl;
      if (data.userCode && targetUrl) {
        setDevicePrompt({
          provider: prov.id,
          name: prov.name,
          userCode: data.userCode,
          verifyUrl: targetUrl,
        });
      }
      if (targetUrl) {
        await openUrl(targetUrl);
      }
      await loadAll(debouncedQuery);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyKey(null);
    }
  };

  const disconnectOAuthProvider = async (providerId: string) => {
    const headers = platformAuthHeaders();
    if (!headers) return;
    setBusyKey(`rm-conn:${providerId}`);
    setErrorMsg(null);
    try {
      const r = await fetch(`${platformApiBase()}/v1/connection/${encodeURIComponent(providerId)}`, {
        method: 'DELETE',
        headers,
      });
      if (!r.ok) throw new Error(`Disconnect failed (${r.status})`);
      await loadAll(debouncedQuery);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyKey(null);
    }
  };

  const mutateChannel = async (chan: ChannelRow, verb: 'connect' | 'disconnect') => {
    const headers = platformAuthHeaders();
    if (!headers) {
      onSignIn?.();
      return;
    }
    setBusyKey(`chan:${chan.id}`);
    setErrorMsg(null);
    try {
      const r = await fetch(`${platformApiBase()}/v1/provider/${encodeURIComponent(chan.id)}/${verb}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!r.ok) {
        const text = await r.text().catch(() => '');
        throw new Error(text || `${verb === 'connect' ? 'Connect' : 'Disconnect'} failed (${r.status})`);
      }
      const j = (await r.json().catch(() => ({}))) as { authorizeUrl?: string };
      if (j.authorizeUrl) {
        await openUrl(j.authorizeUrl);
      }
      await loadAll(debouncedQuery);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyKey(null);
    }
  };

  const toggleSkill = async (skill: SkillRow) => {
    const headers = platformAuthHeaders();
    if (!headers) {
      onSignIn?.();
      return;
    }
    setBusyKey(`skill:${skill.name}`);
    setErrorMsg(null);
    try {
      const body = skill.activated ? { deactivate: [skill.name] } : { activate: [skill.name] };
      const r = await fetch(`${platformApiBase()}/v1/tools/activation`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`Skill update failed (${r.status})`);
      const data = (await r.json().catch(() => null)) as { enabled?: string[] } | null;
      if (Array.isArray(data?.enabled)) {
        const enabledSet = new Set(data.enabled);
        setSkills((prev) => prev.map((s) => ({ ...s, activated: enabledSet.has(s.name) })));
      } else {
        await loadAll(debouncedQuery);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyKey(null);
    }
  };

  const q = query.trim().toLowerCase();
  const filteredConnProviders = useMemo(
    () =>
      connProviders.filter(
        (p) =>
          !q ||
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q),
      ),
    [connProviders, q],
  );
  const filteredChannels = useMemo(
    () =>
      channels.filter(
        (c) =>
          !q ||
          c.name.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          c.category.toLowerCase().includes(q),
      ),
    [channels, q],
  );
  const filteredSkills = useMemo(
    () =>
      skills.filter(
        (s) => !q || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
      ),
    [skills, q],
  );

  const connectedChannels = useMemo(() => channels.filter((c) => c.connected), [channels]);
  const activeSkills = useMemo(() => skills.filter((s) => s.activated), [skills]);
  const totalActiveCount =
    1 +
    (zapBrowsers.length > 0 ? 1 : 0) +
    mcpServers.length +
    connections.length +
    connectedChannels.length +
    activeSkills.length;

  return (
    <div data-slot="desktop-plugins-pane" className="hz-stage-overlay">
      <div className="hz-plugins-shell">
        <div className="hz-plugins-top">
          <div className="hz-plugins-title-row">
            <h1>Plugins &amp; Connectors</h1>
            <button
              type="button"
              className="hz-icon-mini"
              onClick={() => void loadAll(debouncedQuery)}
              aria-label="Refresh connectors"
              title="Refresh live status"
            >
              <RefreshCw size={14} />
            </button>
          </div>
          <p className="hz-plugins-subtitle">
            Live MCP servers, OAuth connectors, messaging channels, org skills, and native ZAP browser extensions.
          </p>

          <div className="hz-plugins-controls">
            <div className="hz-plugins-search">
              <Search size={14} className="hz-surface-item-icon" />
              <input
                type="text"
                placeholder="Search MCP registry, connectors, channels & skills"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search plugins"
              />
              {query ? (
                <button type="button" className="hz-icon-mini" onClick={() => setQuery('')} aria-label="Clear">
                  <X size={12} />
                </button>
              ) : null}
            </div>

            <div className="hz-overlay-tabs">
              {(
                [
                  ['all', 'All'],
                  ['connector', 'Connectors & MCP'],
                  ['channel', 'Channels'],
                  ['skill', 'Skills'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`hz-overlay-tab ${filter === key ? 'is-active' : ''}`}
                  onClick={() => setFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div ref={addMenuRef} className="hz-plugins-add-wrap">
              <button
                type="button"
                className="hz-plugins-add-btn"
                onClick={() => setAddMenuOpen((v) => !v)}
              >
                <Plus size={13} />
                <span>Add</span>
                <ChevronDown size={13} />
              </button>
              {addMenuOpen ? (
                <div className="hz-plugins-add-menu" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    className="hz-surface-menu-item"
                    onClick={() => {
                      setAddMenuOpen(false);
                      setAddingCustom(true);
                    }}
                  >
                    <Link2 size={14} className="hz-surface-item-icon" />
                    <span>Add custom MCP server</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="hz-surface-menu-item"
                    onClick={() => {
                      setAddMenuOpen(false);
                      onClose();
                      window.history.pushState(null, '', '/chat');
                    }}
                  >
                    <MessageSquare size={14} className="hz-surface-item-icon" />
                    <span>Create with Hanzo</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="hz-surface-menu-item"
                    onClick={() => {
                      setAddMenuOpen(false);
                      void openUrl('https://hanzo.market');
                    }}
                  >
                    <Globe size={14} className="hz-surface-item-icon" />
                    <span>Browse hanzo.market</span>
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {errorMsg ? (
          <div className="hz-custom-plugin-box" role="alert" style={{ borderColor: 'rgba(239,68,68,0.35)' }}>
            <div className="hz-custom-plugin-head">
              <span style={{ color: '#fca5a5' }}>{errorMsg}</span>
              <button type="button" className="hz-icon-mini" onClick={() => setErrorMsg(null)}>
                <X size={13} />
              </button>
            </div>
          </div>
        ) : null}

        {devicePrompt ? (
          <div className="hz-custom-plugin-box" role="status">
            <div className="hz-custom-plugin-head">
              <span>Finish connecting {devicePrompt.name}</span>
              <button type="button" className="hz-icon-mini" onClick={() => setDevicePrompt(null)}>
                <X size={13} />
              </button>
            </div>
            <div className="hz-provider-input-row">
              <span style={{ fontSize: 13, color: 'rgba(245,245,245,0.72)' }}>Enter verification code:</span>
              <code
                style={{
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: 14,
                  fontWeight: 600,
                  padding: '4px 10px',
                  borderRadius: 6,
                  background: '#1a1a1a',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: '#ffffff',
                }}
              >
                {devicePrompt.userCode}
              </code>
              <button
                type="button"
                className="hz-pill-btn"
                onClick={() => {
                  void navigator.clipboard?.writeText(devicePrompt.userCode);
                  setCopiedCode(true);
                  window.setTimeout(() => setCopiedCode(false), 1500);
                }}
              >
                {copiedCode ? 'Copied' : 'Copy code'}
              </button>
              <button
                type="button"
                className="hz-pill-btn"
                onClick={() => void openUrl(devicePrompt.verifyUrl)}
              >
                Open sign-in page
              </button>
            </div>
          </div>
        ) : null}

        {addingCustom ? (
          <div className="hz-custom-plugin-box">
            <div className="hz-custom-plugin-head">
              <span>Add custom MCP server</span>
              <button type="button" className="hz-icon-mini" onClick={() => setAddingCustom(false)}>
                <X size={13} />
              </button>
            </div>
            <div className="hz-provider-input-row">
              <input
                type="text"
                className="hz-surface-input"
                placeholder="Name (e.g. Internal Jira MCP)"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
              />
              <input
                type="text"
                className="hz-surface-input"
                placeholder="https://mcp.example.com/sse"
                value={customEndpoint}
                onChange={(e) => setCustomEndpoint(e.target.value)}
              />
              <button
                type="button"
                className="hz-pill-btn"
                disabled={busyKey === 'custom-mcp'}
                onClick={() => void saveCustomMcp()}
              >
                {busyKey === 'custom-mcp' ? 'Adding…' : 'Install'}
              </button>
            </div>
          </div>
        ) : null}

        <div className="hz-plugins-body">
          <section className="hz-plugins-section">
            <div className="hz-plugins-section-head">
              <h3>Active &amp; installed</h3>
              <span className="hz-plugins-count">{totalActiveCount} live</span>
            </div>
            <div className="hz-installed-list">
              <div className="hz-installed-row">
                <div className="hz-plugin-badge is-native">
                  <PluginIcon id="hanzo" />
                </div>
                <div className="hz-installed-meta">
                  <div className="hz-plugin-name-row">
                    <span>hanzo</span>
                    <span className="hz-plugin-tag">Native ZAP</span>
                  </div>
                  <div className="hz-plugin-sub">
                    Built-in MCP &amp; ZAP router · {zapNodes.length} local node{zapNodes.length === 1 ? '' : 's'}
                  </div>
                </div>
                <span className="hz-details-value">
                  <span className="hz-dot is-online" />
                  Active
                </span>
              </div>

              <div className="hz-installed-row">
                <div className="hz-plugin-badge">
                  <PluginIcon id="chrome" />
                </div>
                <div className="hz-installed-meta">
                  <div className="hz-plugin-name-row">
                    <span>Control Chrome</span>
                    <span className="hz-plugin-tag">Browser extension</span>
                  </div>
                  <div className="hz-plugin-sub">
                    {zapBrowsers.length > 0
                      ? `${zapBrowsers.length} browser session${zapBrowsers.length === 1 ? '' : 's'} paired over native ZAP`
                      : 'Install the Hanzo Browser Extension to automate live Chrome tabs over ZAP'}
                  </div>
                </div>
                {zapBrowsers.length > 0 ? (
                  <span className="hz-details-value">
                    <span className="hz-dot is-online" />
                    Connected ({zapBrowsers.length})
                  </span>
                ) : (
                  <button
                    type="button"
                    className="hz-pill-btn"
                    onClick={() => void openUrl('https://hanzo.ai/download')}
                  >
                    Install extension
                  </button>
                )}
              </div>

              {mcpServers.map((srv) => (
                <div key={`srv-${srv.id}`} className="hz-installed-row">
                  <div className="hz-plugin-badge">
                    <Plug size={15} />
                  </div>
                  <div className="hz-installed-meta">
                    <div className="hz-plugin-name-row">
                      <span>{srv.name}</span>
                      <span className="hz-plugin-tag">MCP</span>
                    </div>
                    <div className="hz-plugin-sub">{srv.url || srv.listing || srv.transport || 'Connected MCP server'}</div>
                  </div>
                  <button
                    type="button"
                    className="hz-pill-btn"
                    disabled={busyKey === `rm-mcp:${srv.id}`}
                    onClick={() => void removeMcpServer(srv.id)}
                  >
                    {busyKey === `rm-mcp:${srv.id}` ? 'Removing…' : 'Disconnect'}
                  </button>
                </div>
              ))}

              {connections.map((conn) => (
                <div key={`conn-${conn.provider}`} className="hz-installed-row">
                  <div className="hz-plugin-badge">
                    <PluginIcon id={conn.provider} />
                  </div>
                  <div className="hz-installed-meta">
                    <div className="hz-plugin-name-row">
                      <span>{conn.label || conn.provider}</span>
                      <span className="hz-plugin-tag">Connector</span>
                    </div>
                    <div className="hz-plugin-sub">{conn.account || 'Connected via Hanzo Cloud'}</div>
                  </div>
                  <button
                    type="button"
                    className="hz-pill-btn"
                    disabled={busyKey === `rm-conn:${conn.provider}`}
                    onClick={() => void disconnectOAuthProvider(conn.provider)}
                  >
                    {busyKey === `rm-conn:${conn.provider}` ? 'Removing…' : 'Disconnect'}
                  </button>
                </div>
              ))}

              {connectedChannels.map((ch) => (
                <div key={`ch-${ch.id}`} className="hz-installed-row">
                  <div className="hz-plugin-badge">
                    <PluginIcon id={`channel-${ch.id}`} />
                  </div>
                  <div className="hz-installed-meta">
                    <div className="hz-plugin-name-row">
                      <span>{ch.name}</span>
                      <span className="hz-plugin-tag">Channel</span>
                    </div>
                    <div className="hz-plugin-sub">{ch.account || ch.description || 'Connected channel'}</div>
                  </div>
                  <button
                    type="button"
                    className="hz-pill-btn"
                    disabled={busyKey === `chan:${ch.id}`}
                    onClick={() => void mutateChannel(ch, 'disconnect')}
                  >
                    {busyKey === `chan:${ch.id}` ? 'Disconnecting…' : 'Disconnect'}
                  </button>
                </div>
              ))}
            </div>
          </section>

          {!signedIn ? (
            <section className="hz-plugins-section">
              <div className="hz-custom-plugin-box">
                <div className="hz-custom-plugin-head">
                  <span>Sign in to connect cloud MCP servers, channels &amp; org skills</span>
                  {onSignIn ? (
                    <button type="button" className="hz-plugins-add-btn" onClick={onSignIn}>
                      Sign in with Hanzo
                    </button>
                  ) : null}
                </div>
                <p className="hz-plugins-subtitle">
                  Org connectors, OAuth channels, and the live MCP registry require your Hanzo account session.
                </p>
              </div>
            </section>
          ) : loading ? (
            <section className="hz-plugins-section">
              <p className="hz-plugins-subtitle">Loading live connectors, channels, skills, and MCP registry…</p>
            </section>
          ) : (
            <>
              {(filter === 'all' || filter === 'connector') && filteredConnProviders.length > 0 ? (
                <section className="hz-plugins-section">
                  <div className="hz-plugins-section-head">
                    <h3>Account connectors</h3>
                    <span className="hz-plugins-count">{filteredConnProviders.length} available</span>
                  </div>
                  <div className="hz-directory-grid">
                    {filteredConnProviders.map((prov) => {
                      const isConnected = connectedProviderIds.has(prov.id);
                      const busy = busyKey === `conn:${prov.id}` || busyKey === `rm-conn:${prov.id}`;
                      return (
                        <div key={`prov-${prov.id}`} className="hz-directory-card">
                          <div className="hz-plugin-badge">
                            <PluginIcon id={prov.id} />
                          </div>
                          <div className="hz-directory-card-body">
                            <div className="hz-plugin-name-row">
                              <span className="hz-directory-name">{prov.name}</span>
                              <BadgeCheck size={13} className="hz-verified-icon" />
                            </div>
                            <p className="hz-directory-desc">{prov.description || 'OAuth / device connector'}</p>
                            <div className="hz-directory-meta">
                              <span>{prov.category}</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            className={`hz-connect-btn ${isConnected ? 'is-connected' : ''}`}
                            disabled={busy}
                            onClick={() =>
                              void (isConnected ? disconnectOAuthProvider(prov.id) : connectOAuthProvider(prov))
                            }
                          >
                            {busy ? (
                              'Working…'
                            ) : isConnected ? (
                              <>
                                <Check size={12} />
                                Connected
                              </>
                            ) : (
                              'Connect'
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              {(filter === 'all' || filter === 'connector') ? (
                <section className="hz-plugins-section">
                  <div className="hz-plugins-section-head">
                    <h3>MCP Registry</h3>
                    <span className="hz-plugins-count">
                      {debouncedQuery ? `${catalog.length} of ${catalogTotal} matching` : `${catalog.length} featured`}
                    </span>
                  </div>
                  {catalog.length === 0 ? (
                    <p className="hz-plugins-subtitle">
                      {debouncedQuery ? `No MCP servers matching “${debouncedQuery}”.` : 'No MCP registry listings returned.'}
                    </p>
                  ) : (
                    <div className="hz-directory-grid">
                      {catalog.map((listing) => {
                        const isInstalled = installedListingIds.has(listing.id);
                        const reachable = isCatalogReachable(listing);
                        const busy = busyKey === `mcp:${listing.id}`;
                        const name = catalogLabel(listing);
                        return (
                          <div key={`cat-${listing.id}`} className="hz-directory-card">
                            <div className="hz-plugin-badge">
                              {listing.logo ? (
                                <img
                                  src={listing.logo}
                                  alt=""
                                  width={22}
                                  height={22}
                                  style={{ borderRadius: 5, objectFit: 'contain' }}
                                />
                              ) : (
                                <PluginIcon id={name.toLowerCase()} />
                              )}
                            </div>
                            <div className="hz-directory-card-body">
                              <div className="hz-plugin-name-row">
                                <span className="hz-directory-name">{name}</span>
                              </div>
                              <p className="hz-directory-desc">
                                {listing.description || 'Published MCP server from registry.modelcontextprotocol.io'}
                              </p>
                              <div className="hz-directory-meta">
                                <span>{reachable ? 'HTTP MCP' : `Local ${(listing.packages ?? [])[0]?.registry ?? 'stdio'}`}</span>
                                {listing.vendor ? (
                                  <>
                                    <span>·</span>
                                    <span>{listing.vendor}</span>
                                  </>
                                ) : null}
                              </div>
                            </div>
                            {isInstalled ? (
                              <span className="hz-connect-btn is-connected">
                                <Check size={12} />
                                Installed
                              </span>
                            ) : reachable ? (
                              <button
                                type="button"
                                className="hz-connect-btn"
                                disabled={busy}
                                onClick={() => void installCatalogMcp(listing)}
                              >
                                {busy ? 'Installing…' : 'Install'}
                              </button>
                            ) : (
                              <span className="hz-plugin-tag">CLI / Local</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              ) : null}

              {(filter === 'all' || filter === 'channel') ? (
                <section className="hz-plugins-section">
                  <div className="hz-plugins-section-head">
                    <h3>Channels</h3>
                    <span className="hz-plugins-count">{filteredChannels.length} available</span>
                  </div>
                  {filteredChannels.length === 0 ? (
                    <p className="hz-plugins-subtitle">No channels available for this workspace yet.</p>
                  ) : (
                    <div className="hz-directory-grid">
                      {filteredChannels.map((ch) => {
                        const busy = busyKey === `chan:${ch.id}`;
                        return (
                          <div key={`chan-${ch.id}`} className="hz-directory-card">
                            <div className="hz-plugin-badge">
                              <PluginIcon id={`channel-${ch.id}`} />
                            </div>
                            <div className="hz-directory-card-body">
                              <div className="hz-plugin-name-row">
                                <span className="hz-directory-name">{ch.name}</span>
                              </div>
                              <p className="hz-directory-desc">
                                {ch.description || (ch.connected ? ch.account || 'Connected' : ch.category)}
                              </p>
                              <div className="hz-directory-meta">
                                <span>{ch.connected ? ch.account || 'Connected' : ch.available ? ch.category : 'Needs app credentials'}</span>
                              </div>
                            </div>
                            {ch.connected ? (
                              <button
                                type="button"
                                className="hz-connect-btn is-connected"
                                disabled={busy}
                                onClick={() => void mutateChannel(ch, 'disconnect')}
                              >
                                {busy ? 'Working…' : 'Disconnect'}
                              </button>
                            ) : ch.available ? (
                              <button
                                type="button"
                                className="hz-connect-btn"
                                disabled={busy}
                                onClick={() => void mutateChannel(ch, 'connect')}
                              >
                                {busy ? 'Opening…' : 'Connect'}
                              </button>
                            ) : (
                              <span className="hz-plugin-tag">Admin setup</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              ) : null}

              {(filter === 'all' || filter === 'skill') ? (
                <section className="hz-plugins-section">
                  <div className="hz-plugins-section-head">
                    <h3>Org skills</h3>
                    <span className="hz-plugins-count">
                      {activeSkills.length} of {filteredSkills.length} enabled
                    </span>
                  </div>
                  {filteredSkills.length === 0 ? (
                    <p className="hz-plugins-subtitle">No skills configured in this organization yet.</p>
                  ) : (
                    <div className="hz-directory-grid">
                      {filteredSkills.map((sk) => {
                        const busy = busyKey === `skill:${sk.name}`;
                        return (
                          <div key={`sk-${sk.name}`} className="hz-directory-card">
                            <div className="hz-plugin-badge">
                              <Sparkles size={15} />
                            </div>
                            <div className="hz-directory-card-body">
                              <div className="hz-plugin-name-row">
                                <span className="hz-directory-name">{sk.name}</span>
                              </div>
                              <p className="hz-directory-desc">{sk.description || 'Agent skill'}</p>
                            </div>
                            <button
                              type="button"
                              className={`hz-connect-btn ${sk.activated ? 'is-connected' : ''}`}
                              disabled={busy}
                              onClick={() => void toggleSkill(sk)}
                            >
                              {busy ? (
                                'Saving…'
                              ) : sk.activated ? (
                                <>
                                  <Check size={12} />
                                  Enabled
                                </>
                              ) : (
                                'Enable'
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
 * Connect Providers Overlay (opened by `+` in the Model Picker & Settings)
 * ============================================================================ */

export const PROVIDERS_STORAGE_KEY = 'hanzo.desktop.providers';

export interface ProviderDef {
  id: string;
  name: string;
  subtitle: string;
  placeholder: string;
  docsUrl: string;
}

export const AI_PROVIDERS: readonly ProviderDef[] = [
  {
    id: 'hanzo',
    name: 'Hanzo Cloud (Enso & Zen 6)',
    subtitle: 'Unified router across all frontier & open models via your Hanzo account',
    placeholder: 'hk-… (or sign in via Hanzo IAM)',
    docsUrl: 'https://hanzo.ai/login',
  },
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    subtitle: 'Claude Opus 4.6, Sonnet 4.6, Haiku 4.5',
    placeholder: 'sk-ant-…',
    docsUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'openai',
    name: 'OpenAI (Codex & GPT)',
    subtitle: 'GPT-5.4, o3, GPT-4.1',
    placeholder: 'sk-…',
    docsUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'google',
    name: 'Google (Gemini)',
    subtitle: 'Gemini 2.5 Pro, Gemini 2.5 Flash',
    placeholder: 'AIza…',
    docsUrl: 'https://aistudio.google.com/apikey',
  },
  {
    id: 'xai',
    name: 'xAI (Grok)',
    subtitle: 'Grok 4, Grok 3 Mini',
    placeholder: 'xai-…',
    docsUrl: 'https://console.x.ai/',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    subtitle: 'DeepSeek R1, DeepSeek V3',
    placeholder: 'sk-…',
    docsUrl: 'https://platform.deepseek.com/api_keys',
  },
  {
    id: 'ollama',
    name: 'Local Engines (Hanzo Engine & Ollama)',
    subtitle: 'Auto-detected on 127.0.0.1:36900 & 127.0.0.1:11434',
    placeholder: 'http://127.0.0.1:36900',
    docsUrl: 'https://docs.hanzo.ai/docs/engine',
  },
];

export function readSavedProviders(): Record<string, string> {
  try {
    const raw = localStorage.getItem(PROVIDERS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function ProvidersListSection() {
  const [keys, setKeys] = useState<Record<string, string>>(readSavedProviders);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [engineOnline, setEngineOnline] = useState(false);

  useEffect(() => {
    void fetch('http://127.0.0.1:36900/v1/models')
      .then((r) => setEngineOnline(r.ok))
      .catch(() => setEngineOnline(false));
  }, []);

  const saveKey = (id: string) => {
    try {
      localStorage.setItem(PROVIDERS_STORAGE_KEY, JSON.stringify(keys));
      setSavedId(id);
      setTimeout(() => setSavedId((cur) => (cur === id ? null : cur)), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div className="hz-providers-grid">
      {AI_PROVIDERS.map((p) => {
        const hasValue = Boolean(keys[p.id]?.trim());
        const isLocal = p.id === 'ollama';
        return (
          <div key={p.id} className="hz-provider-card">
            <div className="hz-provider-card-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className="hz-plugin-badge">
                  <PluginIcon id={p.id} />
                </div>
                <div>
                  <div className="hz-provider-name">{p.name}</div>
                  <div className="hz-provider-sub">{p.subtitle}</div>
                </div>
              </div>
              {isLocal ? (
                <span className="hz-details-value">
                  <span className={`hz-dot ${engineOnline ? 'is-online' : ''}`} />
                  {engineOnline ? 'Online' : 'Standby'}
                </span>
              ) : hasValue ? (
                <span className="hz-details-value">
                  <span className="hz-dot is-online" />
                  Connected
                </span>
              ) : null}
            </div>
            <div className="hz-provider-input-row">
              <KeyRound size={13} className="hz-surface-item-icon" />
              <input
                type={isLocal ? 'text' : 'password'}
                className="hz-surface-input"
                placeholder={p.placeholder}
                value={keys[p.id] ?? ''}
                onChange={(e) => setKeys((prev) => ({ ...prev, [p.id]: e.target.value }))}
              />
              <button type="button" className="hz-pill-btn" onClick={() => saveKey(p.id)}>
                {savedId === p.id ? <Check size={13} /> : 'Save'}
              </button>
              <button
                type="button"
                className="hz-pill-btn"
                onClick={() => void openUrl(p.docsUrl)}
              >
                Get key
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ProvidersPluginsOverlay({
  initialTab = 'providers',
  onSignIn,
  onClose,
}: {
  initialTab?: 'providers' | 'plugins';
  onSignIn: () => void;
  onClose: () => void;
}) {
  if (initialTab === 'plugins') {
    return <PluginsDirectoryOverlay onClose={onClose} onSignIn={onSignIn} />;
  }

  return (
    <div data-slot="desktop-providers-pane" className="hz-stage-overlay">
      <div className="hz-overlay-header">
        <div className="hz-overlay-title-row">
          <Blocks size={16} />
          <h2>Connect Providers</h2>
        </div>
        <div className="hz-overlay-actions">
          <button type="button" className="hz-pill-btn" onClick={onSignIn}>
            Sign in with Hanzo
          </button>
          <button type="button" className="hz-icon-mini" onClick={onClose} aria-label="Close">
            <X size={15} />
          </button>
        </div>
      </div>

      <div className="hz-providers-scroll">
        <p className="hz-providers-intro">
          Connect any AI provider directly on this machine, use local GPU inference via Hanzo Engine / Ollama, or sign in with your Hanzo account for Cloud KMS routing.
        </p>
        <ProvidersListSection />
      </div>
    </div>
  );
}

export { Pencil };
