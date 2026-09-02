/**
 * The workspace suite: a local notepad, the org's backlog, its meeting room and
 * its overlay network.
 *
 * Four things were literals and three of them are now reads. The fourth, the
 * notepad, has no route at any depth, so it stays local AND SAYS SO — a
 * document with a `collaborators` list that nothing shares was claiming the
 * opposite of what it is.
 *
 * The notes survive a restart in `localStorage`, which is the honest storage
 * for something only this window has. Losing them on reload would be the other
 * way of lying about what they are.
 */
import { useEffect, useState } from 'react'

import { client, ESTATE } from '~/data/origin'
import type {
  IssuePriority,
  IssueStatus,
  MeetingSession,
  NoteDocument,
  Overlay,
  TodoItem,
  WorkspaceAppId,
} from './types'

export type { MeetingSession, NoteDocument, Overlay, TodoItem, WorkspaceAppId }

const vault = 'hanzo.desktop.notes'

interface WireIssue {
  project?: string
  number?: number
  title?: string
  status?: string
  priority?: string
  assignee?: string
}

interface WireRouter {
  id: string
  name?: string
  region?: string
  status?: string
}

interface WireNetwork {
  id: string
  name?: string
  nodes?: number
  status?: string
}

export interface WorkspaceAppsState {
  isOpen: boolean
  activeApp: WorkspaceAppId
  notes: NoteDocument[]
  activeNoteId: string | null
  todos: TodoItem[]
  /** Null until the call is resolved, or when the deployment serves none. */
  meeting: MeetingSession | null
  /** Null when the org holds no overlay, which is an answer and not a failure. */
  overlay: Overlay | null
  pending: boolean
  fault: string | null
}

/** Notes are this window's, so they are read from and written to this machine. */
const held = (): NoteDocument[] => {
  try {
    const raw = localStorage.getItem(vault)
    return raw ? (JSON.parse(raw) as NoteDocument[]) : []
  } catch {
    return []
  }
}

const keep = (notes: NoteDocument[]) => {
  try {
    localStorage.setItem(vault, JSON.stringify(notes))
  } catch {
    // A window with no storage keeps its notes for this session. That is worse
    // than persisting them and better than refusing to hold them at all.
  }
}

let state: WorkspaceAppsState = {
  isOpen: false,
  activeApp: 'tasks',
  notes: held(),
  activeNoteId: held()[0]?.id ?? null,
  todos: [],
  meeting: null,
  overlay: null,
  pending: false,
  fault: null,
}

const listeners = new Set<(s: WorkspaceAppsState) => void>()

const put = (next: Partial<WorkspaceAppsState>) => {
  state = { ...state, ...next }
  if (next.notes) keep(next.notes)
  listeners.forEach((fn) => fn(state))
}

const because = (e: unknown): string =>
  e instanceof Error ? e.message : typeof e === 'string' ? e : 'the call failed'

const statusOf = (s?: string): IssueStatus =>
  s === 'todo' || s === 'in_progress' || s === 'done' || s === 'cancelled' ? s : 'backlog'

const priorityOf = (s?: string): IssuePriority =>
  s === 'urgent' || s === 'high' || s === 'medium' || s === 'low' ? s : 'none'

const read = async () => {
  put({ pending: true, fault: null })
  const api = client(ESTATE).http
  try {
    // Three independent questions, so one failing costs only its own panel.
    const [issues, call, network, routers] = await Promise.all([
      api.collection<WireIssue>('issues', { path: '/v1/todo/issues' }).catch(() => null),
      api
        .json<{ name?: string; ready?: boolean; ws?: string }>({
          method: 'GET',
          path: '/v1/meet/call',
        })
        .catch(() => null),
      api.collection<WireNetwork>('networks', { path: '/v1/network' }).catch(() => null),
      api.collection<WireRouter>('routers', { path: '/v1/network/routers' }).catch(() => null),
    ])

    const overlay = network?.[0]
    put({
      todos: (issues ?? []).map((one) => ({
        id: `${one.project ?? ''}#${one.number ?? 0}`,
        project: one.project ?? '',
        number: one.number ?? 0,
        text: one.title ?? '',
        status: statusOf(one.status),
        priority: priorityOf(one.priority),
        assignee: one.assignee ?? '',
      })),
      meeting: call ? { name: call.name ?? '', ready: call.ready ?? false, ws: call.ws ?? '' } : null,
      overlay: overlay
        ? {
            id: overlay.id,
            name: overlay.name ?? '',
            nodes: overlay.nodes ?? 0,
            status: overlay.status ?? '',
            routers: (routers ?? []).map((r) => ({
              id: r.id,
              name: r.name || r.id,
              region: r.region ?? '',
              status: r.status ?? '',
            })),
          }
        : null,
      pending: false,
    })
  } catch (e) {
    put({ pending: false, fault: because(e) })
  }
}

export const workspaceAppsStore = {
  get: (): WorkspaceAppsState => state,
  open: (activeApp: WorkspaceAppId = 'tasks') => {
    put({ isOpen: true, activeApp })
    void read()
  },
  close: () => put({ isOpen: false }),
  toggle: (activeApp: WorkspaceAppId = 'tasks') =>
    state.isOpen ? put({ isOpen: false }) : workspaceAppsStore.open(activeApp),
  setActiveApp: (activeApp: WorkspaceAppId) => put({ activeApp }),
  refresh: () => void read(),

  selectNote: (activeNoteId: string) => put({ activeNoteId }),

  updateNoteContent: (id: string, content: string) =>
    put({
      notes: state.notes.map((one) =>
        one.id === id ? { ...one, content, updatedAt: Date.now() } : one,
      ),
    }),

  addNote: (title = 'Untitled') => {
    const one: NoteDocument = {
      id: `note_${Date.now().toString(36)}`,
      title,
      content: '',
      updatedAt: Date.now(),
    }
    put({ notes: [one, ...state.notes], activeNoteId: one.id })
  },

  removeNote: (id: string) => {
    const rest = state.notes.filter((one) => one.id !== id)
    put({ notes: rest, activeNoteId: state.activeNoteId === id ? (rest[0]?.id ?? null) : state.activeNoteId })
  },

  /**
   * Moves an issue between board columns.
   *
   * `PATCH /v1/todo/projects/{key}/issues/{num}` is the one write, and the row
   * is re-read rather than edited in place: the board decides what a move
   * means, including refusing one.
   */
  setTodoStatus: async (id: string, status: IssueStatus) => {
    const one = state.todos.find((t) => t.id === id)
    if (!one || !one.project) return
    put({ fault: null })
    try {
      await client(ESTATE).http.json({
        method: 'PATCH',
        path: `/v1/todo/projects/${one.project}/issues/${one.number}`,
        body: { status },
      })
      await read()
    } catch (e) {
      put({ fault: because(e) })
    }
  },

  /**
   * Opens an issue on a board.
   *
   * The board must be named: an issue belongs to a repository, and there is no
   * inbox to drop one into. Priority defaults to `none` rather than to a middle
   * value — an unstated urgency is not a medium one.
   */
  addTodo: async (project: string, title: string, priority: IssuePriority = 'none') => {
    if (!project.trim() || !title.trim()) return
    put({ fault: null })
    try {
      await client(ESTATE).http.json({
        method: 'POST',
        path: `/v1/todo/projects/${project.trim()}/issues`,
        body: { title: title.trim(), priority },
      })
      await read()
    } catch (e) {
      put({ fault: because(e) })
    }
  },
}

export const useWorkspaceApps = (): WorkspaceAppsState => {
  const [current, setCurrent] = useState<WorkspaceAppsState>(state)
  useEffect(() => {
    listeners.add(setCurrent)
    return () => {
      listeners.delete(setCurrent)
    }
  }, [])
  return current
}
