import { useEffect, useRef, useState, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { HanzoMark } from '@hanzogui/shell';
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
export function LibraryOverlay({ onClose }: { onClose: () => void }) {
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
    <div data-slot="desktop-library-pane" className="hz-stage-overlay">
      <div className="hz-overlay-header">
        <div className="hz-overlay-title-row">
          <Layers size={16} />
          <h2>Library</h2>
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
          <button type="button" className="hz-icon-mini" onClick={onClose} aria-label="Close Library">
            <X size={15} />
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
                className={`hz-list-row ${cwd === f.path ? 'is-selected' : ''}`}
                onClick={() => {
                  setCwd(f.path);
                  setSelectedFile(null);
                }}
              >
                <Folder size={14} />
                <span>{f.name}</span>
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
            <div className="hz-file-viewer">
              <div className="hz-file-viewer-head">
                <span>{selectedFile.path.split('/').pop()}</span>
                <button type="button" className="hz-pill-btn" onClick={() => setSelectedFile(null)}>
                  Back to list
                </button>
              </div>
              <pre className="hz-file-code">{selectedFile.content.slice(0, 80000)}</pre>
            </div>
          ) : loading ? (
            <div className="hz-surface-note">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="hz-surface-note">No items in this view.</div>
          ) : (
            <div className="hz-library-grid">
              {filtered.map((entry) => {
                const isDir = Boolean(entry.is_dir ?? entry.isDir);
                const isImg = !isDir && IMAGE_RE.test(entry.name);
                return (
                  <button
                    key={entry.path}
                    type="button"
                    className="hz-library-card"
                    onClick={() => void openEntry(entry)}
                  >
                    {isDir ? (
                      <Folder size={18} className="hz-surface-item-icon" />
                    ) : isImg ? (
                      <ImageIcon size={18} className="hz-surface-item-icon" />
                    ) : (
                      <FileText size={18} className="hz-surface-item-icon" />
                    )}
                    <span className="hz-library-card-name">{entry.name}</span>
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
 * Plugins Directory — Connectors, Channels, MCP Plugins & Skills
 * ============================================================================ */

type PluginKind = 'connector' | 'channel' | 'skill';

interface DirectoryPlugin {
  id: string;
  name: string;
  description: string;
  kind: PluginKind;
  kindLabel: string;
  author: string;
  category: string;
  verified?: boolean;
  popular?: boolean;
}

const DIRECTORY_PLUGINS: readonly DirectoryPlugin[] = [
  {
    id: 'notion',
    name: 'Notion',
    description: 'Notion skills + Notion MCP server to search, update, and power workflows across your workspace.',
    kind: 'connector',
    kindLabel: 'Commands, connector & skills',
    author: 'Notion',
    category: 'Notes & memory',
    verified: true,
    popular: true,
  },
  {
    id: 'linear',
    name: 'Linear',
    description: 'Create issues, manage projects, update statuses, and search across workspaces.',
    kind: 'connector',
    kindLabel: 'Connector',
    author: 'Linear',
    category: 'Developer tools',
    verified: true,
    popular: true,
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Inspect pull requests, issues, CI runs, commits, and repositories via MCP.',
    kind: 'connector',
    kindLabel: 'Connector & skills',
    author: 'GitHub',
    category: 'Developer tools',
    verified: true,
    popular: true,
  },
  {
    id: 'figma',
    name: 'Figma',
    description: 'Generate diagrams and production code directly from live Figma frames and design tokens.',
    kind: 'connector',
    kindLabel: 'Connector',
    author: 'Figma',
    category: 'Files & documents',
    verified: true,
    popular: true,
  },
  {
    id: 'canva',
    name: 'Canva',
    description: 'Create, edit, review, resize, and export Canva designs via the Canva MCP server.',
    kind: 'connector',
    kindLabel: 'Connector & skills',
    author: 'Canva',
    category: 'Files & documents',
    verified: true,
    popular: true,
  },
  {
    id: 'google-drive',
    name: 'Google Drive',
    description: 'Search, read, and upload files instantly across Drive, Docs, and Sheets.',
    kind: 'connector',
    kindLabel: 'Connector',
    author: 'Google',
    category: 'Files & documents',
    verified: true,
    popular: true,
  },
  {
    id: 'gmail',
    name: 'Gmail',
    description: 'Draft replies, summarize threads, and search your inbox.',
    kind: 'connector',
    kindLabel: 'Connector',
    author: 'Google',
    category: 'Email & messages',
    verified: true,
    popular: true,
  },
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    description: 'Manage your schedule, check availability, and coordinate meetings.',
    kind: 'connector',
    kindLabel: 'Connector',
    author: 'Google',
    category: 'Email & messages',
    verified: true,
  },
  {
    id: 'microsoft-365',
    name: 'Microsoft 365',
    description: 'Connect Outlook mail, calendar, Teams, and OneDrive files.',
    kind: 'connector',
    kindLabel: 'Connector',
    author: 'Microsoft',
    category: 'Email & messages',
    verified: true,
  },
  {
    id: 'atlassian',
    name: 'Atlassian MCP',
    description: 'Search, read, and update Jira, Confluence, Bitbucket, and Loom with your permissions.',
    kind: 'connector',
    kindLabel: 'Connector',
    author: 'Atlassian',
    category: 'Developer tools',
    verified: true,
  },
  {
    id: 'supabase',
    name: 'Supabase',
    description: 'Manage Postgres databases, migrations, authentication, and storage.',
    kind: 'connector',
    kindLabel: 'Connector',
    author: 'Supabase',
    category: 'Developer tools',
    verified: true,
  },
  {
    id: 'vercel',
    name: 'Vercel',
    description: 'Build, inspect logs, and deploy web apps and agents.',
    kind: 'connector',
    kindLabel: 'Hooks, agents & connector',
    author: 'Vercel',
    category: 'Developer tools',
    verified: true,
  },
  {
    id: 'hubspot',
    name: 'HubSpot',
    description: 'CRM context for accounts, deals, pipeline, and customer insights.',
    kind: 'connector',
    kindLabel: 'Connector',
    author: 'HubSpot',
    category: 'Websites & commerce',
    verified: true,
  },
  {
    id: 'shopify',
    name: 'Shopify',
    description: 'Build, manage, and analyze your Shopify storefront and orders.',
    kind: 'connector',
    kindLabel: 'Connector',
    author: 'Shopify',
    category: 'Websites & commerce',
    verified: true,
  },
  {
    id: 'firecrawl',
    name: 'Firecrawl',
    description: 'Crawl, search, and extract structured web data from any URL.',
    kind: 'connector',
    kindLabel: 'Connector',
    author: 'Firecrawl',
    category: 'Websites & commerce',
    verified: true,
  },
  {
    id: 'exa',
    name: 'Exa',
    description: 'Neural web search and real-time code documentation search.',
    kind: 'connector',
    kindLabel: 'Connector',
    author: 'Exa',
    category: 'Websites & commerce',
    verified: true,
  },
  {
    id: 'granola',
    name: 'Granola',
    description: 'Ask about your meeting notes, transcripts, and action items.',
    kind: 'connector',
    kindLabel: 'Connector',
    author: 'Granola',
    category: 'Notes & memory',
    verified: true,
  },
  {
    id: 'dropbox',
    name: 'Dropbox',
    description: 'Browse, search, and share files stored in Dropbox.',
    kind: 'connector',
    kindLabel: 'Connector',
    author: 'Dropbox',
    category: 'Files & documents',
    verified: true,
  },
  {
    id: 'pubmed',
    name: 'PubMed',
    description: 'Search biomedical literature, abstracts, and clinical studies.',
    kind: 'connector',
    kindLabel: 'Connector',
    author: 'NCBI',
    category: 'Science',
    verified: true,
  },
  {
    id: 'channel-slack',
    name: 'Slack',
    description: 'Send messages, create canvases, monitor channels, and trigger agents from threads.',
    kind: 'channel',
    kindLabel: 'Channel & connector',
    author: 'Slack',
    category: 'Email & messages',
    verified: true,
    popular: true,
  },
  {
    id: 'channel-discord',
    name: 'Discord',
    description: 'Connect Hanzo agents to Discord servers, threads, and slash commands.',
    kind: 'channel',
    kindLabel: 'Channel',
    author: 'Hanzo',
    category: 'Email & messages',
    verified: true,
  },
  {
    id: 'channel-telegram',
    name: 'Telegram',
    description: 'Chat with your desktop and cloud agents directly from Telegram.',
    kind: 'channel',
    kindLabel: 'Channel',
    author: 'Hanzo',
    category: 'Email & messages',
    verified: true,
  },
  {
    id: 'channel-whatsapp',
    name: 'WhatsApp',
    description: 'Two-way messaging channel for personal or team assistant workflows.',
    kind: 'channel',
    kindLabel: 'Channel',
    author: 'Hanzo',
    category: 'Email & messages',
    verified: true,
  },
  {
    id: 'channel-imessage',
    name: 'iMessage (macOS)',
    description: 'Local macOS Messages bridge with approval-gated replies.',
    kind: 'channel',
    kindLabel: 'Local channel',
    author: 'Hanzo',
    category: 'Email & messages',
    verified: true,
  },
  {
    id: 'channel-zoom',
    name: 'Zoom',
    description: 'Search, recap, and act on Zoom meetings and transcripts.',
    kind: 'channel',
    kindLabel: 'Channel & connector',
    author: 'Zoom',
    category: 'Notes & memory',
    verified: true,
  },
  {
    id: 'skill-superpowers',
    name: 'Superpowers',
    description: 'Core engineering skills library: TDD, systematic debugging, architecture planning, and verification.',
    kind: 'skill',
    kindLabel: 'Hooks & skills',
    author: 'Community',
    category: 'Developer tools',
    verified: true,
    popular: true,
  },
  {
    id: 'skill-frontend-design',
    name: 'Frontend Design',
    description: 'UI/UX design craftsmanship, visual hierarchy, typography, and component systems.',
    kind: 'skill',
    kindLabel: 'Skill',
    author: 'Hanzo',
    category: 'Developer tools',
    verified: true,
    popular: true,
  },
  {
    id: 'skill-engineering',
    name: 'Engineering',
    description: 'Streamline code reviews, incident triage, RFCs, and release checklists.',
    kind: 'skill',
    kindLabel: 'Connectors & skills',
    author: 'Hanzo',
    category: 'Developer tools',
    verified: true,
  },
  {
    id: 'skill-product',
    name: 'Product Management',
    description: 'Write feature specs, plan roadmaps, synthesize user feedback, and draft launch notes.',
    kind: 'skill',
    kindLabel: 'Commands & skills',
    author: 'Hanzo',
    category: 'Productivity',
    verified: true,
  },
  {
    id: 'skill-sales',
    name: 'Sales',
    description: 'Prep calls, research accounts, review pipeline, and draft follow-ups using CRM context.',
    kind: 'skill',
    kindLabel: 'Connectors & skills',
    author: 'Hanzo',
    category: 'Productivity',
    verified: true,
  },
  {
    id: 'skill-data',
    name: 'Data & SQL',
    description: 'Write SQL, explore datasets, generate interactive visualizations, and audit schemas.',
    kind: 'skill',
    kindLabel: 'Connectors & skills',
    author: 'Hanzo',
    category: 'Developer tools',
    verified: true,
  },
  {
    id: 'skill-carta',
    name: 'Carta Cap Table',
    description: 'Skills and hooks for querying cap tables, grants, SAFEs, 409A valuations, and financing rounds.',
    kind: 'skill',
    kindLabel: 'Hooks & skills',
    author: 'Carta',
    category: 'Finance',
    verified: true,
  },
  {
    id: 'skill-legal',
    name: 'Legal',
    description: 'Speed up contract review, NDA triage, redlines, and compliance summaries.',
    kind: 'skill',
    kindLabel: 'Connectors & skills',
    author: 'Hanzo',
    category: 'Productivity',
    verified: true,
  },
];

interface CustomPlugin {
  id: string;
  name: string;
  endpoint: string;
  kind: PluginKind;
}

const ENABLED_PLUGINS_KEY = 'hanzo.desktop.enabledPlugins';
const CUSTOM_PLUGINS_KEY = 'hanzo.desktop.customPlugins';

function readEnabledPlugins(): string[] {
  try {
    const raw = localStorage.getItem(ENABLED_PLUGINS_KEY);
    if (!raw) return ['notion', 'linear', 'github'];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readCustomPlugins(): CustomPlugin[] {
  try {
    const raw = localStorage.getItem(CUSTOM_PLUGINS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function PluginsDirectoryOverlay({
  onClose,
}: {
  onClose: () => void;
}) {
  const [filter, setFilter] = useState<'all' | PluginKind>('all');
  const [query, setQuery] = useState('');
  const [enabledIds, setEnabledIds] = useState<string[]>(readEnabledPlugins);
  const [customPlugins, setCustomPlugins] = useState<CustomPlugin[]>(readCustomPlugins);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [addingCustom, setAddingCustom] = useState<PluginKind | null>(null);
  const [customName, setCustomName] = useState('');
  const [customEndpoint, setCustomEndpoint] = useState('');
  const addMenuRef = useRef<HTMLDivElement | null>(null);

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

  const togglePlugin = (id: string) => {
    setEnabledIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        localStorage.setItem(ENABLED_PLUGINS_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const saveCustomPlugin = () => {
    const name = customName.trim();
    const endpoint = customEndpoint.trim();
    if (!name || !endpoint || !addingCustom) return;
    const next = [
      ...customPlugins,
      { id: `custom-${Date.now().toString(36)}`, name, endpoint, kind: addingCustom },
    ];
    setCustomPlugins(next);
    try {
      localStorage.setItem(CUSTOM_PLUGINS_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
    setCustomName('');
    setCustomEndpoint('');
    setAddingCustom(null);
  };

  const removeCustomPlugin = (id: string) => {
    const next = customPlugins.filter((p) => p.id !== id);
    setCustomPlugins(next);
    try {
      localStorage.setItem(CUSTOM_PLUGINS_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const q = query.trim().toLowerCase();
  const visibleDirectory = DIRECTORY_PLUGINS.filter((item) => {
    if (filter !== 'all' && item.kind !== filter) return false;
    if (!q) return true;
    return (
      item.name.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      item.author.toLowerCase().includes(q)
    );
  });

  const enabledDirectoryItems = DIRECTORY_PLUGINS.filter((item) => enabledIds.includes(item.id));

  return (
    <div data-slot="desktop-plugins-pane" className="hz-stage-overlay">
      <div className="hz-plugins-shell">
        <div className="hz-plugins-top">
          <div className="hz-plugins-title-row">
            <h1>Plugins</h1>
          </div>
          <p className="hz-plugins-subtitle">
            Connect Hanzo to your apps, channels, MCP servers, and skills. Hanzo MCP is natively installed.
          </p>

          <div className="hz-plugins-controls">
            <div className="hz-plugins-search">
              <Search size={14} className="hz-surface-item-icon" />
              <input
                type="text"
                placeholder="Search plugins, connectors, channels & skills"
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
                  ['connector', 'Connectors'],
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
                      setAddingCustom('connector');
                    }}
                  >
                    <Link2 size={14} className="hz-surface-item-icon" />
                    <span>Add custom MCP connector</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="hz-surface-menu-item"
                    onClick={() => {
                      setAddMenuOpen(false);
                      setAddingCustom('channel');
                    }}
                  >
                    <Radio size={14} className="hz-surface-item-icon" />
                    <span>Add channel</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="hz-surface-menu-item"
                    onClick={() => {
                      setAddMenuOpen(false);
                      setAddingCustom('skill');
                    }}
                  >
                    <Upload size={14} className="hz-surface-item-icon" />
                    <span>Upload plugin / skill</span>
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
                    <span>Browse marketplace</span>
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {addingCustom ? (
          <div className="hz-custom-plugin-box">
            <div className="hz-custom-plugin-head">
              <span>
                {addingCustom === 'connector'
                  ? 'Add custom MCP connector'
                  : addingCustom === 'channel'
                    ? 'Add messaging channel'
                    : 'Add custom plugin or skill'}
              </span>
              <button type="button" className="hz-icon-mini" onClick={() => setAddingCustom(null)}>
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
                placeholder={
                  addingCustom === 'connector'
                    ? 'https://mcp.example.com/sse or npx @org/mcp-server'
                    : 'Endpoint URL, webhook, or local skill path'
                }
                value={customEndpoint}
                onChange={(e) => setCustomEndpoint(e.target.value)}
              />
              <button type="button" className="hz-pill-btn" onClick={saveCustomPlugin}>
                Add
              </button>
            </div>
          </div>
        ) : null}

        <div className="hz-plugins-body">
          <section className="hz-plugins-section">
            <div className="hz-plugins-section-head">
              <h3>Your plugins</h3>
              <span className="hz-plugins-count">
                {2 + customPlugins.length + enabledDirectoryItems.length} active
              </span>
            </div>
            <div className="hz-installed-list">
              <div className="hz-installed-row">
                <div className="hz-plugin-badge is-native">
                  <PluginIcon id="hanzo" />
                </div>
                <div className="hz-installed-meta">
                  <div className="hz-plugin-name-row">
                    <span>hanzo</span>
                    <span className="hz-plugin-tag">Native</span>
                  </div>
                  <div className="hz-plugin-sub">Built-in MCP server · always installed</div>
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
                    <span className="hz-plugin-tag">Desktop extension</span>
                  </div>
                  <div className="hz-plugin-sub">Live browser tabs & DOM automation via ZAP</div>
                </div>
                <span className="hz-details-value">
                  <span className="hz-dot is-online" />
                  Ready
                </span>
              </div>

              {customPlugins.map((cp) => (
                <div key={cp.id} className="hz-installed-row">
                  <div className="hz-plugin-badge">
                    <Plug size={15} />
                  </div>
                  <div className="hz-installed-meta">
                    <div className="hz-plugin-name-row">
                      <span>{cp.name}</span>
                      <span className="hz-plugin-tag">Custom {cp.kind}</span>
                    </div>
                    <div className="hz-plugin-sub">{cp.endpoint}</div>
                  </div>
                  <button
                    type="button"
                    className="hz-icon-mini"
                    onClick={() => removeCustomPlugin(cp.id)}
                    aria-label={`Remove ${cp.name}`}
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}

              {enabledDirectoryItems.map((item) => (
                <div key={item.id} className="hz-installed-row">
                  <div className="hz-plugin-badge">
                    <PluginIcon id={item.id} />
                  </div>
                  <div className="hz-installed-meta">
                    <div className="hz-plugin-name-row">
                      <span>{item.name}</span>
                      <span className="hz-plugin-tag">{item.kindLabel}</span>
                    </div>
                    <div className="hz-plugin-sub">{item.description}</div>
                  </div>
                  <button
                    type="button"
                    className="hz-pill-btn"
                    onClick={() => togglePlugin(item.id)}
                  >
                    Connected
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="hz-plugins-section">
            <div className="hz-plugins-section-head">
              <h3>
                {filter === 'all'
                  ? 'Directory'
                  : filter === 'connector'
                    ? 'Connectors & MCP servers'
                    : filter === 'channel'
                      ? 'Channels'
                      : 'Skills & workflows'}
              </h3>
              <span className="hz-plugins-count">{visibleDirectory.length} available</span>
            </div>

            <div className="hz-directory-grid">
              {visibleDirectory.map((item) => {
                const connected = enabledIds.includes(item.id);
                return (
                  <div key={item.id} className="hz-directory-card">
                    <div className="hz-plugin-badge">
                      <PluginIcon id={item.id} />
                    </div>
                    <div className="hz-directory-card-body">
                      <div className="hz-plugin-name-row">
                        <span className="hz-directory-name">{item.name}</span>
                        {item.verified ? (
                          <BadgeCheck size={13} className="hz-verified-icon" />
                        ) : null}
                      </div>
                      <p className="hz-directory-desc">{item.description}</p>
                      <div className="hz-directory-meta">
                        <span>{item.kindLabel}</span>
                        <span>·</span>
                        <span>By {item.author}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className={`hz-connect-btn ${connected ? 'is-connected' : ''}`}
                      onClick={() => togglePlugin(item.id)}
                    >
                      {connected ? (
                        <>
                          <Check size={12} />
                          Added
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
    return <PluginsDirectoryOverlay onClose={onClose} />;
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
