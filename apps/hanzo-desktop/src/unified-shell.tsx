import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { KEYS, asked } from '@hanzo/app/help';
import { summons } from '@hanzo/app/seek';

import {
  DESKTOP_CROSS_APPS,
  resolveDesktopShellBrand,
  type CrossAppItem,
  type DesktopShellBrand,
} from './lib/brand-identity';

export type BotLiveStatus = 'running' | 'awaiting_approval' | 'idle';

export interface DesktopBotItem {
  id: string;
  name: string;
  role: string;
  status: BotLiveStatus;
  runtimeBadge: string;
  lastSummary: string;
}

export interface DesktopChannelItem {
  id: string;
  name: string;
  topic: string;
  unreadCount: number;
  privateChannel?: boolean;
}

export interface DesktopDirectItem {
  id: string;
  handle: string;
  name: string;
  kind: 'bot' | 'member';
  presence: 'online' | 'busy' | 'offline';
  role: string;
}

export interface DesktopOrgOption {
  id: string;
  displayName: string;
  planBadge: string;
}

export const DEFAULT_DESKTOP_ORGS: readonly DesktopOrgOption[] = [
  { id: 'hanzo', displayName: 'Hanzo AI', planBadge: 'Dev 5x' },
  { id: 'personal', displayName: 'Personal', planBadge: 'Free' },
  { id: 'lux', displayName: 'Lux Industries', planBadge: 'Team' },
] as const;

export const DEFAULT_BOT_ROSTER: readonly DesktopBotItem[] = [
  {
    id: 'bot-release-marshal',
    name: 'Release Marshal',
    role: 'CI verification, canary rollout & changelog synthesis',
    status: 'running',
    runtimeBadge: 'qwen3-coder · cloud resident',
    lastSummary: 'Streaming k8s canary metrics for v1.14.2 rollout across us-west.',
  },
  {
    id: 'bot-pr-guardian',
    name: 'PR Guardian',
    role: 'Security review, typecheck gates & merge approvals',
    status: 'awaiting_approval',
    runtimeBadge: 'zen6 · cloud resident',
    lastSummary: 'Awaiting approval to merge PR #482 after passing 341 unit checks.',
  },
  {
    id: 'bot-support-triage',
    name: 'Inbox Triage',
    role: 'Customer escalation routing & SLA response',
    status: 'running',
    runtimeBadge: 'zen6-flash · cloud resident',
    lastSummary: 'Classified 19 enterprise tickets and drafted 4 technical replies.',
  },
  {
    id: 'bot-research-scout',
    name: 'Research Scout',
    role: 'Daily benchmark tracking & paper synthesis',
    status: 'idle',
    runtimeBadge: 'qwen3-30b · local/cloud',
    lastSummary: 'Completed 08:00 UTC frontier evaluation digest.',
  },
] as const;

export const DEFAULT_TEAM_CHANNELS: readonly DesktopChannelItem[] = [
  {
    id: 'c-general',
    name: 'general',
    topic: 'Company-wide announcements, milestones & daily sync',
    unreadCount: 2,
  },
  {
    id: 'c-engineering',
    name: 'engineering',
    topic: 'Architecture, Hanzo Dev PRs, runtime & SDK releases',
    unreadCount: 5,
  },
  {
    id: 'c-deployments',
    name: 'deployments',
    topic: 'Live cluster rollouts, Dokploy / K8s pipelines & telemetry',
    unreadCount: 0,
  },
  {
    id: 'c-approvals',
    name: 'approvals',
    topic: 'Human-in-the-loop sign-offs for autonomous bots & spend',
    unreadCount: 3,
  },
  {
    id: 'c-incidents',
    name: 'incidents',
    topic: 'On-call alerts, postmortems & latency budgets',
    unreadCount: 0,
    privateChannel: true,
  },
] as const;

export const DEFAULT_TEAM_DIRECTS: readonly DesktopDirectItem[] = [
  {
    id: 'dm-hanzo-dev',
    handle: '@hanzo-dev',
    name: 'Hanzo Dev',
    kind: 'bot',
    presence: 'online',
    role: 'Coding Agent Handoff',
  },
  {
    id: 'dm-release-bot',
    handle: '@release-bot',
    name: 'Release Bot',
    kind: 'bot',
    presence: 'online',
    role: 'Deploy & Canary Bot',
  },
  {
    id: 'dm-zach',
    handle: '@zach',
    name: 'Zach Kelling',
    kind: 'member',
    presence: 'online',
    role: 'CTO',
  },
  {
    id: 'dm-antje',
    handle: '@antje',
    name: 'Antje Worring',
    kind: 'member',
    presence: 'busy',
    role: 'CEO',
  },
] as const;

const ORG_STORAGE_KEY = 'hanzo:x-org-id';
const SIDEBAR_STORAGE_KEY = 'hanzo.unified.sidebar.collapsed';

export function readActiveOrgId(): string {
  try {
    return (
      window.localStorage.getItem(ORG_STORAGE_KEY) ||
      window.localStorage.getItem('hanzo_iam_org') ||
      'hanzo'
    );
  } catch {
    return 'hanzo';
  }
}

export function writeActiveOrgId(orgId: string): void {
  try {
    window.localStorage.setItem(ORG_STORAGE_KEY, orgId);
    window.localStorage.setItem('hanzo_iam_org', orgId);
    window.dispatchEvent(new CustomEvent('hanzo:org-changed', { detail: { orgId, header: 'X-Org-Id' } }));
  } catch {
    // ignore storage errors
  }
}

function statusDotColor(status: BotLiveStatus): string {
  if (status === 'running') return '#10b981'; // emerald
  if (status === 'awaiting_approval') return '#f59e0b'; // amber
  return '#71717a'; // zinc
}

function statusLabel(status: BotLiveStatus): string {
  if (status === 'running') return 'Running';
  if (status === 'awaiting_approval') return 'Awaiting approval';
  return 'Idle';
}

function presenceDotColor(presence: DesktopDirectItem['presence']): string {
  if (presence === 'online') return '#10b981';
  if (presence === 'busy') return '#f59e0b';
  return '#52525b';
}

export interface UnifiedDesktopShellProps {
  brand?: DesktopShellBrand;
  barInset?: number;
  isAuthenticated?: boolean;
  userName?: string;
  userEmail?: string;
  onNavigate?: (path: string) => void;
  onSignIn?: () => void;
  children?: ReactNode;
}

export function UnifiedDesktopShell({
  brand: brandProp,
  barInset = 0,
  isAuthenticated = false,
  userName,
  userEmail,
  onNavigate,
  onSignIn,
  children,
}: UnifiedDesktopShellProps) {
  const activeBrand = brandProp ?? resolveDesktopShellBrand();
  const isMac =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [filter, setFilter] = useState('');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState('');
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  // Org switcher (`X-Org-Id`)
  const [activeOrgId, setActiveOrgId] = useState<string>(readActiveOrgId);
  const activeOrg =
    DEFAULT_DESKTOP_ORGS.find((o) => o.id === activeOrgId) ?? DEFAULT_DESKTOP_ORGS[0];

  // Bot sidebar state (`brand === 'bot'`)
  const [bots, setBots] = useState<DesktopBotItem[]>(() => [...DEFAULT_BOT_ROSTER]);
  const [selectedBotId, setSelectedBotId] = useState<string>(DEFAULT_BOT_ROSTER[0].id);
  const [creatingBot, setCreatingBot] = useState(false);
  const [newBotName, setNewBotName] = useState('');
  const [activeBotNav, setActiveBotNav] = useState<'console' | 'workflows' | 'approvals' | 'runs'>(
    'console',
  );
  const [botMessages, setBotMessages] = useState<Record<string, Array<{ id: string; who: 'user' | 'bot'; text: string }>>>({});
  const [composerDraft, setComposerDraft] = useState('');

  // Team sidebar state (`brand === 'team'`)
  const [channels, setChannels] = useState<DesktopChannelItem[]>(() => [...DEFAULT_TEAM_CHANNELS]);
  const [selectedRoomId, setSelectedRoomId] = useState<string>('c-general');
  const [creatingChannel, setCreatingChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [channelMessages, setChannelMessages] = useState<
    Record<string, Array<{ id: string; author: string; text: string }>>
  >({
    'c-general': [
      {
        id: 'm-1',
        author: 'Zach Kelling',
        text: 'Unified Hanzo Dev obsidian shell is live across Web, Bot, Team, and Desktop.',
      },
      {
        id: 'm-2',
        author: '@hanzo-dev',
        text: 'Verified typecheck and unit suites across all workspace packages.',
      },
    ],
  });

  const composerRef = useRef<HTMLInputElement | null>(null);

  const toggleSidebar = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const navigate = useCallback(
    (target: string) => {
      if (onNavigate) {
        onNavigate(target);
        return;
      }
      if (/^https?:\/\//.test(target)) {
        window.open(target, '_blank', 'noopener,noreferrer');
        return;
      }
      window.history.pushState(null, '', target);
    },
    [onNavigate],
  );

  // Unified Hanzo Dev keyboard shortcuts: ⌘B, ⌘K, ⇧⌘O, ⌘,, ⌘/
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;

      if (asked(e)) {
        e.preventDefault();
        setShortcutsOpen((prev) => !prev);
        return;
      }

      if (summons(e)) {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
        return;
      }

      const mod = e.metaKey || e.ctrlKey;
      const lower = (e.key || '').toLowerCase();

      if (
        mod &&
        !e.shiftKey &&
        !e.altKey &&
        !e.repeat &&
        lower === 'b' &&
        !(e.target as HTMLElement | null)?.isContentEditable
      ) {
        e.preventDefault();
        toggleSidebar();
        return;
      }

      if (mod && e.shiftKey && !e.altKey && !e.repeat && lower === 'o') {
        e.preventDefault();
        setComposerDraft('');
        composerRef.current?.focus();
        return;
      }

      if (mod && !e.shiftKey && !e.altKey && !e.repeat && e.key === ',') {
        e.preventDefault();
        navigate('/settings');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate, toggleSidebar]);

  const filteredBots = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return bots;
    return bots.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        b.role.toLowerCase().includes(q) ||
        b.runtimeBadge.toLowerCase().includes(q),
    );
  }, [bots, filter]);

  const filteredChannels = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return channels;
    return channels.filter(
      (c) => c.name.toLowerCase().includes(q) || c.topic.toLowerCase().includes(q),
    );
  }, [channels, filter]);

  const filteredDirects = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return DEFAULT_TEAM_DIRECTS;
    return DEFAULT_TEAM_DIRECTS.filter(
      (d) =>
        d.handle.toLowerCase().includes(q) ||
        d.name.toLowerCase().includes(q) ||
        d.role.toLowerCase().includes(q),
    );
  }, [filter]);

  const activeBot = bots.find((b) => b.id === selectedBotId) ?? bots[0];
  const activeChannel = channels.find((c) => c.id === selectedRoomId);
  const activeDirect = DEFAULT_TEAM_DIRECTS.find((d) => d.id === selectedRoomId);

  const handleCreateBot = (e: FormEvent) => {
    e.preventDefault();
    const clean = newBotName.trim();
    if (!clean) return;
    const created: DesktopBotItem = {
      id: `bot-${Date.now()}`,
      name: clean,
      role: 'Custom autonomous routine & tool runner',
      status: 'running',
      runtimeBadge: 'zen6 · cloud resident',
      lastSummary: 'Initialized on Zen 6 runtime. Ready for tasks.',
    };
    setBots((prev) => [created, ...prev]);
    setSelectedBotId(created.id);
    setActiveBotNav('console');
    setNewBotName('');
    setCreatingBot(false);
  };

  const handleCreateChannel = (e: FormEvent) => {
    e.preventDefault();
    const clean = newChannelName.trim().toLowerCase().replace(/^#+/, '').replace(/\s+/g, '-');
    if (!clean) return;
    const created: DesktopChannelItem = {
      id: `c-${clean}-${Date.now()}`,
      name: clean,
      topic: `#${clean} team coordination channel`,
      unreadCount: 0,
    };
    setChannels((prev) => [...prev, created]);
    setSelectedRoomId(created.id);
    setNewChannelName('');
    setCreatingChannel(false);
  };

  const handleSendStageMessage = (e: FormEvent) => {
    e.preventDefault();
    const text = composerDraft.trim();
    if (!text) return;
    setComposerDraft('');

    if (activeBrand === 'bot' && activeBot) {
      const botId = activeBot.id;
      setBotMessages((prev) => ({
        ...prev,
        [botId]: [
          ...(prev[botId] ?? []),
          { id: `u-${Date.now()}`, who: 'user', text },
          {
            id: `b-${Date.now() + 1}`,
            who: 'bot',
            text: `[${activeBot.runtimeBadge}] Dispatched "${text}" in org ${activeOrg.id}.`,
          },
        ],
      }));
      return;
    }

    if (activeBrand === 'team') {
      const roomId = selectedRoomId;
      setChannelMessages((prev) => ({
        ...prev,
        [roomId]: [
          ...(prev[roomId] ?? []),
          { id: `m-${Date.now()}`, author: userName || 'You', text },
        ],
      }));
    }
  };

  const handleSelectOrg = (orgId: string) => {
    setActiveOrgId(orgId);
    writeActiveOrgId(orgId);
    setAccountOpen(false);
  };

  const handleCrossApp = (item: CrossAppItem) => {
    setAccountOpen(false);
    setPaletteOpen(false);
    if (item.internalPath) {
      navigate(item.internalPath);
    } else {
      navigate(item.href);
    }
  };

  const brandProductSuffix =
    activeBrand === 'bot' ? 'Bot' : activeBrand === 'team' ? 'Team' : activeBrand === 'dev' ? 'Dev' : 'App';

  return (
    <div
      data-slot="unified-shell-floor"
      data-testid="unified-desktop-shell"
      data-brand-mode={activeBrand}
      style={{
        display: 'flex',
        height: '100vh',
        width: '100vw',
        backgroundColor: '#050505',
        color: '#f4f4f5',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Inter Variable", "Segoe UI", system-ui, sans-serif',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      {/* Left Collapsible Sidebar (#09090b, 256px) */}
      {!collapsed && (
        <aside
          role="navigation"
          aria-label={`Hanzo ${brandProductSuffix} sidebar`}
          data-slot="unified-sidebar"
          data-testid="unified-left-sidebar"
          style={{
            width: 256,
            minWidth: 256,
            height: '100%',
            backgroundColor: '#09090b',
            borderRight: '1px solid rgba(255, 255, 255, 0.06)',
            display: 'flex',
            flexDirection: 'column',
            boxSizing: 'border-box',
            paddingTop: barInset ? 8 : 0,
          }}
        >
          {/* Sidebar Top Chrome Header */}
          <div
            data-tauri-drag-region="true"
            style={{
              height: 52,
              paddingLeft: barInset ? Math.max(12, barInset) : 12,
              paddingRight: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
              <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em', color: '#fafafa' }}>
                Hanzo
              </span>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#a1a1aa' }}>
                {brandProductSuffix}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                type="button"
                data-testid="sidebar-command-palette-trigger"
                aria-label="Open Command Palette"
                onClick={() => setPaletteOpen(true)}
                style={{
                  height: 26,
                  padding: '0 8px',
                  borderRadius: 7,
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  backgroundColor: '#111114',
                  color: '#a1a1aa',
                  fontSize: 11,
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span>{isMac ? '⌘K' : 'Ctrl+K'}</span>
              </button>

              <button
                type="button"
                data-testid="sidebar-collapse-trigger"
                aria-label="Toggle sidebar"
                title={`Toggle sidebar (${isMac ? '⌘B' : 'Ctrl+B'})`}
                onClick={toggleSidebar}
                style={{
                  height: 26,
                  padding: '0 7px',
                  borderRadius: 7,
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  backgroundColor: 'transparent',
                  color: '#a1a1aa',
                  fontSize: 11,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span>◧</span>
                <span style={{ fontSize: 10, opacity: 0.75 }}>{isMac ? '⌘B' : 'Ctrl+B'}</span>
              </button>
            </div>
          </div>

          {/* Primary New Action + Filter Input */}
          <div style={{ padding: '0 10px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              type="button"
              data-testid="sidebar-primary-new-btn"
              onClick={() => {
                if (activeBrand === 'bot') setCreatingBot((v) => !v);
                else if (activeBrand === 'team') setCreatingChannel((v) => !v);
                else composerRef.current?.focus();
              }}
              style={{
                height: 32,
                padding: '0 10px',
                borderRadius: 8,
                border: '1px solid rgba(255, 255, 255, 0.1)',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                color: '#fafafa',
                fontSize: 12.5,
                fontWeight: 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>
                {activeBrand === 'bot'
                  ? '+ New Bot'
                  : activeBrand === 'team'
                    ? '+ New Channel'
                    : '+ New Thread'}
              </span>
              <span style={{ fontSize: 11, color: '#71717a' }}>{isMac ? '⇧⌘O' : 'Ctrl+Shift+O'}</span>
            </button>

            <input
              type="search"
              data-testid="sidebar-filter-input"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={
                activeBrand === 'bot'
                  ? 'Filter bots & routines...'
                  : activeBrand === 'team'
                    ? `Jump to channel or person... ${isMac ? '⌘K' : 'Ctrl+K'}`
                    : `Filter threads... ${isMac ? '⌘K' : 'Ctrl+K'}`
              }
              aria-label={
                activeBrand === 'bot'
                  ? 'Filter bots & routines'
                  : activeBrand === 'team'
                    ? 'Jump to channel or person'
                    : 'Filter threads'
              }
              style={{
                height: 30,
                width: '100%',
                padding: '0 10px',
                borderRadius: 8,
                border: '1px solid rgba(255, 255, 255, 0.08)',
                backgroundColor: '#0f0f12',
                color: '#f4f4f5',
                fontSize: 12,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Scrollable Sidebar Body */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              padding: '0 8px 10px',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            {activeBrand === 'bot' && (
              <>
                {/* Inline Create Bot Form */}
                {creatingBot && (
                  <form
                    onSubmit={handleCreateBot}
                    data-testid="create-bot-inline-form"
                    style={{
                      padding: 8,
                      borderRadius: 8,
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      backgroundColor: '#111114',
                      display: 'flex',
                      gap: 6,
                    }}
                  >
                    <input
                      type="text"
                      value={newBotName}
                      onChange={(e) => setNewBotName(e.target.value)}
                      placeholder="Bot name (zen6)..."
                      aria-label="New bot name"
                      style={{
                        flex: 1,
                        minWidth: 0,
                        height: 26,
                        padding: '0 8px',
                        borderRadius: 6,
                        border: '1px solid rgba(255,255,255,0.1)',
                        backgroundColor: '#09090b',
                        color: '#fafafa',
                        fontSize: 12,
                      }}
                    />
                    <button
                      type="submit"
                      style={{
                        height: 26,
                        padding: '0 9px',
                        borderRadius: 6,
                        border: 0,
                        backgroundColor: '#fafafa',
                        color: '#09090b',
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Add
                    </button>
                  </form>
                )}

                {/* First-class Bots Section */}
                <div data-testid="bot-sidebar-section" style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '2px 6px 4px',
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: '#71717a',
                    }}
                  >
                    <span>Bots ({filteredBots.length})</span>
                    <button
                      type="button"
                      data-testid="bots-section-add-btn"
                      onClick={() => setCreatingBot((v) => !v)}
                      style={{
                        border: 0,
                        background: 'transparent',
                        color: '#a1a1aa',
                        fontSize: 11,
                        cursor: 'pointer',
                        padding: '0 4px',
                      }}
                    >
                      + New Bot
                    </button>
                  </div>

                  {filteredBots.map((bot) => {
                    const active = activeBotNav === 'console' && bot.id === activeBot?.id;
                    return (
                      <button
                        key={bot.id}
                        type="button"
                        data-testid={`sidebar-bot-row-${bot.id}`}
                        aria-current={active ? 'page' : undefined}
                        onClick={() => {
                          setSelectedBotId(bot.id);
                          setActiveBotNav('console');
                        }}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: '7px 8px',
                          borderRadius: 8,
                          border: active
                            ? '1px solid rgba(255, 255, 255, 0.12)'
                            : '1px solid transparent',
                          backgroundColor: active ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                          color: active ? '#fafafa' : '#d4d4d8',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 3,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                            <span
                              data-testid={`bot-status-dot-${bot.status}`}
                              title={statusLabel(bot.status)}
                              style={{
                                width: 7,
                                height: 7,
                                borderRadius: 999,
                                backgroundColor: statusDotColor(bot.status),
                                flexShrink: 0,
                              }}
                            />
                            <span style={{ fontSize: 12.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {bot.name}
                            </span>
                          </span>
                        </div>
                        <div style={{ paddingLeft: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span
                            style={{
                              fontSize: 10.5,
                              padding: '1px 6px',
                              borderRadius: 999,
                              backgroundColor: 'rgba(255, 255, 255, 0.06)',
                              color: '#a1a1aa',
                            }}
                          >
                            {bot.runtimeBadge}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Quick Sidebar Links: Workflows (/flow), Approvals, Runs */}
                <div data-testid="bot-quick-links" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div
                    style={{
                      padding: '4px 6px',
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: '#71717a',
                    }}
                  >
                    Operations
                  </div>
                  {(
                    [
                      { id: 'workflows', label: 'Workflows', badge: '/flow', path: '/flow' },
                      {
                        id: 'approvals',
                        label: 'Approvals',
                        badge: String(bots.filter((b) => b.status === 'awaiting_approval').length),
                      },
                      {
                        id: 'runs',
                        label: 'Runs',
                        badge: String(bots.filter((b) => b.status === 'running').length),
                      },
                    ] as const
                  ).map((nav) => {
                    const active = activeBotNav === nav.id;
                    return (
                      <button
                        key={nav.id}
                        type="button"
                        data-testid={`bot-quick-link-${nav.id}`}
                        onClick={() => {
                          setActiveBotNav(nav.id);
                          if ('path' in nav && nav.path && onNavigate) {
                            onNavigate(nav.path);
                          }
                        }}
                        style={{
                          height: 30,
                          padding: '0 8px',
                          borderRadius: 8,
                          border: 0,
                          backgroundColor: active ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                          color: active ? '#fafafa' : '#a1a1aa',
                          fontSize: 12.5,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span>{nav.label}</span>
                        <span
                          style={{
                            fontSize: 10.5,
                            padding: '1px 6px',
                            borderRadius: 999,
                            backgroundColor: 'rgba(255, 255, 255, 0.06)',
                            color: '#d4d4d8',
                          }}
                        >
                          {nav.badge}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {activeBrand === 'team' && (
              <>
                {creatingChannel && (
                  <form
                    onSubmit={handleCreateChannel}
                    data-testid="create-channel-inline-form"
                    style={{
                      padding: 8,
                      borderRadius: 8,
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      backgroundColor: '#111114',
                      display: 'flex',
                      gap: 6,
                    }}
                  >
                    <input
                      type="text"
                      value={newChannelName}
                      onChange={(e) => setNewChannelName(e.target.value)}
                      placeholder="new-channel"
                      aria-label="New channel name"
                      style={{
                        flex: 1,
                        minWidth: 0,
                        height: 26,
                        padding: '0 8px',
                        borderRadius: 6,
                        border: '1px solid rgba(255,255,255,0.1)',
                        backgroundColor: '#09090b',
                        color: '#fafafa',
                        fontSize: 12,
                      }}
                    />
                    <button
                      type="submit"
                      style={{
                        height: 26,
                        padding: '0 9px',
                        borderRadius: 6,
                        border: 0,
                        backgroundColor: '#fafafa',
                        color: '#09090b',
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Add
                    </button>
                  </form>
                )}

                {/* First-class Channels Section */}
                <div data-testid="team-channels-section" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '2px 6px 4px',
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: '#71717a',
                    }}
                  >
                    <span>Channels ({filteredChannels.length})</span>
                    <button
                      type="button"
                      data-testid="channels-section-add-btn"
                      onClick={() => setCreatingChannel((v) => !v)}
                      style={{
                        border: 0,
                        background: 'transparent',
                        color: '#a1a1aa',
                        fontSize: 11,
                        cursor: 'pointer',
                        padding: '0 4px',
                      }}
                    >
                      + New Channel
                    </button>
                  </div>

                  {filteredChannels.map((ch) => {
                    const active = selectedRoomId === ch.id;
                    return (
                      <button
                        key={ch.id}
                        type="button"
                        data-testid={`sidebar-channel-${ch.name}`}
                        aria-current={active ? 'page' : undefined}
                        onClick={() => {
                          setSelectedRoomId(ch.id);
                          setChannels((prev) =>
                            prev.map((item) => (item.id === ch.id ? { ...item, unreadCount: 0 } : item)),
                          );
                        }}
                        style={{
                          height: 30,
                          padding: '0 8px',
                          borderRadius: 8,
                          border: active
                            ? '1px solid rgba(255, 255, 255, 0.12)'
                            : '1px solid transparent',
                          backgroundColor: active ? 'rgba(255, 255, 255, 0.09)' : 'transparent',
                          color: active || ch.unreadCount > 0 ? '#fafafa' : '#a1a1aa',
                          fontWeight: active || ch.unreadCount > 0 ? 600 : 400,
                          fontSize: 12.5,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ch.privateChannel ? '🔒 ' : '#'}
                          {ch.name}
                        </span>
                        {ch.unreadCount > 0 && (
                          <span
                            data-testid={`channel-unread-${ch.name}`}
                            style={{
                              fontSize: 10.5,
                              fontWeight: 600,
                              padding: '1px 6px',
                              borderRadius: 999,
                              backgroundColor: '#fafafa',
                              color: '#09090b',
                            }}
                          >
                            {ch.unreadCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Direct & Bot Handoffs Section */}
                <div data-testid="team-directs-section" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div
                    style={{
                      padding: '4px 6px',
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: '#71717a',
                    }}
                  >
                    Direct &amp; Bot Handoffs
                  </div>

                  {filteredDirects.map((dm) => {
                    const active = selectedRoomId === dm.id;
                    return (
                      <button
                        key={dm.id}
                        type="button"
                        data-testid={`sidebar-direct-${dm.id}`}
                        aria-current={active ? 'page' : undefined}
                        onClick={() => setSelectedRoomId(dm.id)}
                        style={{
                          height: 30,
                          padding: '0 8px',
                          borderRadius: 8,
                          border: active
                            ? '1px solid rgba(255, 255, 255, 0.12)'
                            : '1px solid transparent',
                          backgroundColor: active ? 'rgba(255, 255, 255, 0.09)' : 'transparent',
                          color: active ? '#fafafa' : '#a1a1aa',
                          fontSize: 12.5,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 6,
                        }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                          <span
                            style={{
                              width: 7,
                              height: 7,
                              borderRadius: 999,
                              backgroundColor: presenceDotColor(dm.presence),
                              flexShrink: 0,
                            }}
                          />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {dm.handle}
                          </span>
                        </span>
                        <span style={{ fontSize: 10.5, color: '#71717a', flexShrink: 0 }}>{dm.role}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {(activeBrand === 'hanzo' || activeBrand === 'dev') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div
                  style={{
                    padding: '2px 6px 4px',
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: '#71717a',
                  }}
                >
                  Surfaces
                </div>
                {DESKTOP_CROSS_APPS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleCrossApp(item)}
                    style={{
                      height: 30,
                      padding: '0 8px',
                      borderRadius: 8,
                      border: 0,
                      backgroundColor: 'transparent',
                      color: '#d4d4d8',
                      fontSize: 12.5,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>{item.label}</span>
                    <span style={{ fontSize: 10.5, color: '#71717a' }}>{item.subtitle.split('·')[0]}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Unified Bottom-Left Hanzo Account & Org Switcher (X-Org-Id) Pill */}
          <div
            style={{
              padding: '8px 10px 10px',
              borderTop: '1px solid rgba(255, 255, 255, 0.06)',
              position: 'relative',
            }}
          >
            {accountOpen && (
              <div
                role="menu"
                aria-label="Hanzo Account and Organization Switcher"
                data-testid="account-org-menu"
                style={{
                  position: 'absolute',
                  bottom: 58,
                  left: 10,
                  right: 10,
                  backgroundColor: '#111114',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: 12,
                  padding: 8,
                  boxShadow: '0 20px 48px rgba(0, 0, 0, 0.8)',
                  zIndex: 40,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div style={{ padding: '4px 6px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#fafafa' }}>
                    {isAuthenticated ? userName || 'Signed in' : 'Sign in via hanzo.id'}
                  </div>
                  <div style={{ fontSize: 11, color: '#71717a' }}>
                    {userEmail || `X-Org-Id: ${activeOrg.id}`}
                  </div>
                  {!isAuthenticated && (
                    <button
                      type="button"
                      data-testid="account-signin-hanzo-id"
                      onClick={() => {
                        setAccountOpen(false);
                        if (onSignIn) onSignIn();
                        else navigate('/login');
                      }}
                      style={{
                        marginTop: 6,
                        width: '100%',
                        height: 28,
                        borderRadius: 7,
                        border: 0,
                        backgroundColor: '#fafafa',
                        color: '#09090b',
                        fontSize: 11.5,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Sign in with hanzo.id →
                    </button>
                  )}
                </div>

                <div style={{ fontSize: 10.5, fontWeight: 600, color: '#71717a', padding: '2px 6px' }}>
                  ORGANIZATIONS (X-ORG-ID)
                </div>
                {DEFAULT_DESKTOP_ORGS.map((org) => (
                  <button
                    key={org.id}
                    type="button"
                    data-testid={`org-switch-${org.id}`}
                    onClick={() => handleSelectOrg(org.id)}
                    style={{
                      height: 28,
                      padding: '0 8px',
                      borderRadius: 7,
                      border: 0,
                      backgroundColor:
                        org.id === activeOrg.id ? 'rgba(255,255,255,0.09)' : 'transparent',
                      color: '#e4e4e7',
                      fontSize: 12,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>{org.displayName}</span>
                    <span style={{ fontSize: 10.5, color: '#a1a1aa' }}>
                      {org.id === activeOrg.id ? `✓ ${org.planBadge}` : org.planBadge}
                    </span>
                  </button>
                ))}

                <div
                  style={{
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                    paddingTop: 4,
                    fontSize: 10.5,
                    fontWeight: 600,
                    color: '#71717a',
                    paddingLeft: 6,
                  }}
                >
                  SWITCH HANZO APP
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                  {DESKTOP_CROSS_APPS.map((appItem) => (
                    <button
                      key={appItem.id}
                      type="button"
                      data-testid={`cross-app-${appItem.id}`}
                      onClick={() => handleCrossApp(appItem)}
                      style={{
                        height: 26,
                        padding: '0 8px',
                        borderRadius: 6,
                        border: '1px solid rgba(255,255,255,0.06)',
                        backgroundColor: 'rgba(255,255,255,0.03)',
                        color: '#d4d4d8',
                        fontSize: 11,
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      {appItem.label}
                    </button>
                  ))}
                </div>

                <div
                  style={{
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                    paddingTop: 4,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                  }}
                >
                  <button
                    type="button"
                    data-testid="account-open-settings"
                    onClick={() => {
                      setAccountOpen(false);
                      navigate('/settings');
                    }}
                    style={{
                      height: 28,
                      padding: '0 8px',
                      borderRadius: 7,
                      border: 0,
                      backgroundColor: 'transparent',
                      color: '#d4d4d8',
                      fontSize: 12,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>Settings</span>
                    <span style={{ fontSize: 11, color: '#71717a' }}>{isMac ? '⌘,' : 'Ctrl+,'}</span>
                  </button>
                  <button
                    type="button"
                    data-testid="account-open-shortcuts"
                    onClick={() => {
                      setAccountOpen(false);
                      setShortcutsOpen(true);
                    }}
                    style={{
                      height: 28,
                      padding: '0 8px',
                      borderRadius: 7,
                      border: 0,
                      backgroundColor: 'transparent',
                      color: '#d4d4d8',
                      fontSize: 12,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>Keyboard shortcuts</span>
                    <span style={{ fontSize: 11, color: '#71717a' }}>{isMac ? '⌘/' : 'Ctrl+/'}</span>
                  </button>
                </div>
              </div>
            )}

            <button
              type="button"
              data-testid="unified-account-org-switcher"
              aria-expanded={accountOpen}
              onClick={() => setAccountOpen((v) => !v)}
              style={{
                width: '100%',
                height: 42,
                padding: '0 10px',
                borderRadius: 10,
                border: '1px solid rgba(255, 255, 255, 0.08)',
                backgroundColor: '#0f0f12',
                color: '#fafafa',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <span
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 999,
                    backgroundColor: 'rgba(255,255,255,0.12)',
                    color: '#fafafa',
                    fontSize: 11,
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {(userName || activeOrg.displayName).charAt(0).toUpperCase()}
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left', minWidth: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {isAuthenticated ? userName || activeOrg.displayName : `${activeOrg.displayName} · hanzo.id`}
                  </span>
                  <span style={{ fontSize: 10.5, color: '#a1a1aa' }}>
                    {activeOrg.id} · {activeOrg.planBadge}
                  </span>
                </div>
              </div>
              <span
                style={{
                  fontSize: 10,
                  padding: '2px 6px',
                  borderRadius: 999,
                  backgroundColor: 'rgba(255,255,255,0.08)',
                  color: '#d4d4d8',
                  flexShrink: 0,
                }}
              >
                {activeOrg.planBadge}
              </span>
            </button>
          </div>
        </aside>
      )}

      {/* Inset Rounded Stage Pane (#0f0f12, 1px solid rgba(255,255,255,0.08)) */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          height: '100%',
          padding: 8,
          boxSizing: 'border-box',
          display: 'flex',
        }}
      >
        <main
          data-slot="unified-stage-pane"
          data-testid="unified-stage-pane"
          style={{
            flex: 1,
            minWidth: 0,
            height: '100%',
            backgroundColor: '#0f0f12',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 12,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Stage Top Bar */}
          <header
            data-tauri-drag-region="true"
            style={{
              height: 48,
              padding: '0 16px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              {collapsed && (
                <button
                  type="button"
                  data-testid="stage-expand-sidebar-trigger"
                  aria-label="Open sidebar"
                  onClick={toggleSidebar}
                  style={{
                    height: 28,
                    padding: '0 8px',
                    borderRadius: 7,
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    backgroundColor: 'rgba(255, 255, 255, 0.04)',
                    color: '#d4d4d8',
                    fontSize: 11.5,
                    cursor: 'pointer',
                  }}
                >
                  ◧ {isMac ? '⌘B' : 'Ctrl+B'}
                </button>
              )}

              {activeBrand === 'bot' && activeBot && (
                <>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      backgroundColor: statusDotColor(activeBot.status),
                    }}
                  />
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: '#fafafa' }}>
                    {activeBotNav === 'console'
                      ? activeBot.name
                      : activeBotNav === 'workflows'
                        ? 'Workflows (/flow)'
                        : activeBotNav === 'approvals'
                          ? 'Pending Bot Approvals'
                          : 'Live Bot Runs'}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      padding: '2px 8px',
                      borderRadius: 999,
                      border: '1px solid rgba(255,255,255,0.08)',
                      color: '#a1a1aa',
                    }}
                  >
                    {activeBot.runtimeBadge}
                  </span>
                </>
              )}

              {activeBrand === 'team' && (
                <>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: '#fafafa' }}>
                    {activeChannel
                      ? `#${activeChannel.name}`
                      : activeDirect
                        ? `${activeDirect.handle} · ${activeDirect.name}`
                        : '#general'}
                  </span>
                  {activeChannel?.topic && (
                    <span
                      style={{
                        fontSize: 12,
                        color: '#71717a',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {activeChannel.topic}
                    </span>
                  )}
                </>
              )}

              {(activeBrand === 'hanzo' || activeBrand === 'dev') && (
                <span style={{ fontSize: 13.5, fontWeight: 600, color: '#fafafa' }}>
                  Hanzo {brandProductSuffix}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  fontSize: 11,
                  padding: '2px 8px',
                  borderRadius: 999,
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  color: '#a1a1aa',
                }}
              >
                X-Org-Id: {activeOrg.id}
              </span>
            </div>
          </header>

          {/* Stage Content */}
          {children ? (
            <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>{children}</div>
          ) : (
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: 'auto',
                  padding: '20px 24px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                {activeBrand === 'bot' && activeBot && (
                  <>
                    <div
                      style={{
                        padding: 16,
                        borderRadius: 12,
                        border: '1px solid rgba(255,255,255,0.08)',
                        backgroundColor: '#111114',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#fafafa' }}>
                        {activeBot.name} · {statusLabel(activeBot.status)}
                      </div>
                      <div style={{ fontSize: 12.5, color: '#a1a1aa' }}>{activeBot.role}</div>
                      <div style={{ fontSize: 12, color: '#d4d4d8', marginTop: 4 }}>
                        {activeBot.lastSummary}
                      </div>
                    </div>

                    {(botMessages[activeBot.id] ?? []).map((msg) => (
                      <div
                        key={msg.id}
                        style={{
                          alignSelf: msg.who === 'user' ? 'flex-end' : 'flex-start',
                          maxWidth: '78%',
                          padding: '10px 14px',
                          borderRadius: 12,
                          backgroundColor:
                            msg.who === 'user' ? '#fafafa' : 'rgba(255,255,255,0.05)',
                          color: msg.who === 'user' ? '#09090b' : '#f4f4f5',
                          fontSize: 13,
                        }}
                      >
                        {msg.text}
                      </div>
                    ))}
                  </>
                )}

                {activeBrand === 'team' && (
                  <>
                    {(channelMessages[selectedRoomId] ?? []).map((msg) => (
                      <div
                        key={msg.id}
                        style={{
                          padding: '10px 14px',
                          borderRadius: 10,
                          border: '1px solid rgba(255,255,255,0.06)',
                          backgroundColor: '#111114',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 4,
                        }}
                      >
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#fafafa' }}>
                          {msg.author}
                        </span>
                        <span style={{ fontSize: 13, color: '#d4d4d8' }}>{msg.text}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>

              {/* Unified Stage Composer */}
              <form
                onSubmit={handleSendStageMessage}
                style={{
                  padding: '12px 20px',
                  borderTop: '1px solid rgba(255,255,255,0.06)',
                  display: 'flex',
                  gap: 8,
                }}
              >
                <input
                  ref={composerRef}
                  type="text"
                  data-slot="composer-field"
                  data-testid="unified-stage-composer"
                  value={composerDraft}
                  onChange={(e) => setComposerDraft(e.target.value)}
                  placeholder={
                    activeBrand === 'bot' && activeBot
                      ? `Steer ${activeBot.name} (${activeBot.runtimeBadge})…`
                      : activeBrand === 'team'
                        ? `Message ${activeChannel ? `#${activeChannel.name}` : activeDirect?.handle || '#general'}…`
                        : 'Ask Hanzo anything…'
                  }
                  style={{
                    flex: 1,
                    height: 38,
                    padding: '0 14px',
                    borderRadius: 999,
                    border: '1px solid rgba(255,255,255,0.12)',
                    backgroundColor: '#09090b',
                    color: '#fafafa',
                    fontSize: 13,
                    outline: 'none',
                  }}
                />
                <button
                  type="submit"
                  style={{
                    height: 38,
                    padding: '0 16px',
                    borderRadius: 999,
                    border: 0,
                    backgroundColor: '#fafafa',
                    color: '#09090b',
                    fontSize: 12.5,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Send
                </button>
              </form>
            </div>
          )}
        </main>
      </div>

      {/* Command Palette Modal (⌘K) */}
      {paletteOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Command Palette"
          data-testid="unified-command-palette"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPaletteOpen(false);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.68)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            paddingTop: '14vh',
            zIndex: 80,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 520,
              backgroundColor: '#111114',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 12,
              padding: 12,
              boxShadow: '0 24px 64px rgba(0,0,0,0.85)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <input
              type="search"
              autoFocus
              value={paletteQuery}
              onChange={(e) => setPaletteQuery(e.target.value)}
              placeholder="Jump to bot, channel, workflow, or Hanzo app…"
              aria-label="Command palette search"
              style={{
                height: 36,
                padding: '0 12px',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.1)',
                backgroundColor: '#09090b',
                color: '#fafafa',
                fontSize: 13,
                outline: 'none',
              }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 280, overflowY: 'auto' }}>
              {DESKTOP_CROSS_APPS.filter(
                (a) =>
                  !paletteQuery.trim() ||
                  a.label.toLowerCase().includes(paletteQuery.toLowerCase()) ||
                  a.subtitle.toLowerCase().includes(paletteQuery.toLowerCase()),
              ).map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => handleCrossApp(a)}
                  style={{
                    height: 32,
                    padding: '0 10px',
                    borderRadius: 7,
                    border: 0,
                    backgroundColor: 'transparent',
                    color: '#e4e4e7',
                    fontSize: 12.5,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>Open Hanzo {a.label}</span>
                  <span style={{ fontSize: 11, color: '#71717a' }}>{a.subtitle}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Keyboard Shortcuts Dialog (⌘/) */}
      {shortcutsOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Keyboard shortcuts"
          data-testid="unified-shortcuts-dialog"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShortcutsOpen(false);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.68)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 80,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 420,
              backgroundColor: '#111114',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 12,
              padding: 18,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, color: '#fafafa', marginBottom: 4 }}>
              Keyboard shortcuts
            </div>
            {KEYS.map((k) => (
              <div
                key={k.does}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: 12.5,
                  color: '#d4d4d8',
                  padding: '3px 0',
                }}
              >
                <span>{String(k.does)}</span>
                <kbd
                  style={{
                    fontSize: 11,
                    padding: '2px 7px',
                    borderRadius: 6,
                    border: '1px solid rgba(255,255,255,0.12)',
                    backgroundColor: '#09090b',
                    color: '#fafafa',
                  }}
                >
                  {isMac ? k.mac : k.pc}
                </kbd>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
