/**
 * Store for Hanzo Workspace Suite (tasks, todo, notes, meet, tunnel).
 */
import { useEffect, useState } from 'react'
import type {
  MeetingSession,
  NoteDocument,
  TodoItem,
  WorkspaceAppId,
  ZeroTrustTunnel,
} from './types'

export interface WorkspaceAppsState {
  isOpen: boolean
  activeApp: WorkspaceAppId
  notes: NoteDocument[]
  activeNoteId: string | null
  todos: TodoItem[]
  meeting: MeetingSession
  tunnel: ZeroTrustTunnel
}

const DEFAULT_NOTES: NoteDocument[] = [
  {
    id: 'note-arch-spec',
    title: 'Hanzo Zero-Allocation ZAP Architecture Spec',
    content: `# ZAP Protocol & Microservices Architecture
- Zero-allocation binary encoding for telemetry & chat completions.
- Sub-millisecond p99 latency over NATS JetStream and eBPF kernel tracing.
- Hardware KMS envelope encryption (AES-256-GCM) on all microVM nodes.`,
    updatedAt: '3m ago',
    collaborators: ['user_self', 'agent_planner'],
    tags: ['Architecture', 'ZAP', 'Security'],
  },
  {
    id: 'note-sprint-goals',
    title: 'Q3 Swarm & Edge Cloud Roadmap',
    content: `# Q3 Objectives
1. Converge all desktop and mobile capabilities into Chat2.
2. Ship zero-trust Cloudflare & WireGuard tunnel sharing for local dev.
3. Integrate meet.hanzo.ai live transcription sidecar agents.`,
    updatedAt: '12m ago',
    collaborators: ['user_self', 'user_alex', 'agent_dev'],
    tags: ['Roadmap', 'Swarm'],
  },
]

const DEFAULT_TODOS: TodoItem[] = [
  {
    id: 'todo-1',
    text: 'Audit KMS hardware enclave key wrapping in gVisor sandboxes',
    completed: true,
    assignedAgent: '@secops',
    priority: 'P0',
  },
  {
    id: 'todo-2',
    text: 'Implement zero-trust Cloudflare tunnel ephemeral pairing',
    completed: false,
    assignedAgent: '@executor',
    priority: 'P0',
    dueDate: 'Today',
  },
  {
    id: 'todo-3',
    text: 'Wire real-time WebRTC audio room with @notetaker AI transcription',
    completed: false,
    assignedAgent: '@dev',
    priority: 'P1',
    dueDate: 'Tomorrow',
  },
  {
    id: 'todo-4',
    text: 'Benchmark ZAP binary protocol streaming vs standard SSE',
    completed: false,
    assignedAgent: '@planner',
    priority: 'P1',
  },
]

const DEFAULT_MEETING: MeetingSession = {
  id: 'meet-hanzo-daily',
  roomName: 'dev-swarm-standup',
  isLive: true,
  activeParticipants: [
    { id: 'user_self', name: 'You (Host)', isMuted: false, isCameraOn: true },
    { id: 'user_alex', name: 'Alex Vance', isMuted: false, isCameraOn: false },
    { id: 'agent_dev', name: '@dev (AI Assistant)', isMuted: false, isCameraOn: true, isAgent: true },
    { id: 'agent_planner', name: '@notetaker (AI)', isMuted: true, isCameraOn: false, isAgent: true },
  ],
  transcript: [
    { speaker: 'Alex Vance', text: 'Local k3s cluster is configured with Traefik v3 ingress.', timestamp: '10:42 AM' },
    { speaker: '@dev', text: 'All Next.js 16 routes and ZAP streams verified with 22/22 unit tests passing.', timestamp: '10:43 AM' },
    { speaker: 'You', text: 'Let us spin up the Zero-Trust tunnel so the design team can test the preview.', timestamp: '10:44 AM' },
    { speaker: '@notetaker', text: '✓ Action item logged: Ephemeral ZT tunnel exposed to team.', timestamp: '10:44 AM' },
  ],
  aiSummary: 'Team confirmed local k3s cluster readiness and Next.js 16 build stability. Next step is enabling Zero-Trust tunnel sharing for team co-piloting.',
}

const DEFAULT_TUNNEL: ZeroTrustTunnel = {
  status: 'active',
  tunnelUrl: 'https://dev-z-machine.zt.hanzo.ai',
  localPort: 5173,
  connectedClients: 3,
  enclaveKey: 'kms-gvisor-ec25519-7f39a0',
}

let state: WorkspaceAppsState = {
  isOpen: false,
  activeApp: 'tasks',
  notes: DEFAULT_NOTES,
  activeNoteId: 'note-arch-spec',
  todos: DEFAULT_TODOS,
  meeting: DEFAULT_MEETING,
  tunnel: DEFAULT_TUNNEL,
}

const listeners = new Set<(s: WorkspaceAppsState) => void>()

const notify = () => {
  listeners.forEach((fn) => fn(state))
}

export const workspaceAppsStore = {
  get: (): WorkspaceAppsState => state,

  open: (app: WorkspaceAppId = 'tasks') => {
    state = { ...state, isOpen: true, activeApp: app }
    notify()
  },

  close: () => {
    state = { ...state, isOpen: false }
    notify()
  },

  toggle: (app: WorkspaceAppId = 'tasks') => {
    if (state.isOpen && state.activeApp === app) {
      state = { ...state, isOpen: false }
    } else {
      state = { ...state, isOpen: true, activeApp: app }
    }
    notify()
  },

  setActiveApp: (activeApp: WorkspaceAppId) => {
    state = { ...state, activeApp }
    notify()
  },

  // Note actions
  selectNote: (id: string) => {
    state = { ...state, activeNoteId: id }
    notify()
  },

  updateNoteContent: (id: string, content: string) => {
    state = {
      ...state,
      notes: state.notes.map((n) => (n.id === id ? { ...n, content, updatedAt: 'Just now' } : n)),
    }
    notify()
  },

  addNote: (title = 'Untitled Note') => {
    const newNote: NoteDocument = {
      id: `note-${Date.now()}`,
      title,
      content: `# ${title}\n\nStart writing markdown or ask @dev to brainstorm...`,
      updatedAt: 'Just now',
      collaborators: ['user_self'],
      tags: ['Draft'],
    }
    state = {
      ...state,
      notes: [newNote, ...state.notes],
      activeNoteId: newNote.id,
    }
    notify()
  },

  // Todo actions
  toggleTodo: (id: string) => {
    state = {
      ...state,
      todos: state.todos.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)),
    }
    notify()
  },

  addTodo: (text: string, assignedAgent?: string, priority: TodoItem['priority'] = 'P1') => {
    const newTodo: TodoItem = {
      id: `todo-${Date.now()}`,
      text,
      completed: false,
      assignedAgent,
      priority,
    }
    state = {
      ...state,
      todos: [newTodo, ...state.todos],
    }
    notify()
  },

  // Tunnel actions
  toggleTunnel: () => {
    state = {
      ...state,
      tunnel: {
        ...state.tunnel,
        status: state.tunnel.status === 'active' ? 'offline' : 'active',
      },
    }
    notify()
  },
}

export const useWorkspaceApps = (): WorkspaceAppsState => {
  const [current, setCurrent] = useState<WorkspaceAppsState>(state)

  useEffect(() => {
    const handler = (next: WorkspaceAppsState) => setCurrent(next)
    listeners.add(handler)
    return () => {
      listeners.delete(handler)
    }
  }, [])

  return current
}
