/**
 * The workspace suite: a local notepad, the org's backlog, its meeting room and
 * its overlay network.
 *
 * Three of the four are reads under their own key. The notepad is not: there is
 * no note route at any depth, so it is a LOCAL value and says so. It lives in an
 * atom backed by `localStorage`, which is the honest storage for something only
 * this window has — losing it on reload would be the other way of lying about
 * what it is.
 */
import { atom, useAtom } from '@hanzo/chat/data/store'
import { keys } from '../data/keys'
import { client, ESTATE } from '@hanzo/chat/data/origin'
import { reason, useRead, useSend } from '@hanzo/chat/data/query'
import { fromSeconds } from '@hanzo/chat/show'
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
  identifier?: string
  project?: string
  number?: number
  title?: string
  status?: string
  priority?: string
  assignee?: string
  updatedAt?: number
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

/** Notes are this window's, so they are read from and written to this machine. */
const held = (): NoteDocument[] => {
  try {
    const raw = localStorage.getItem(vault)
    return raw ? (JSON.parse(raw) as NoteDocument[]) : []
  } catch {
    return []
  }
}

/** Whether the panel is showing, which app is on, and which note is selected. */
export const open = atom(false)
export const app = atom<WorkspaceAppId>('tasks')
export const notes = atom<NoteDocument[]>(held())
export const note = atom<string | null>(held()[0]?.id ?? null)

/**
 * Whether the last save reached the disk.
 *
 * `localStorage` is a few megabytes per origin and notes are unbounded, so a
 * long-lived window WILL eventually fill it — and `setItem` throws when it
 * does. Swallowing that made the newest note look saved and lose it on the next
 * reload, which is the worst shape a failure can take. It is a value now, so
 * the panel can say the note is not being kept.
 */
export const saved = atom(true)

/** Every write to the notepad persists, because that is what makes it a notepad. */
notes.watch(() => {
  try {
    localStorage.setItem(vault, JSON.stringify(notes.get()))
    saved.set(true)
  } catch {
    // Two different failures land here and both mean the same thing to a person
    // typing: this is not being kept. A window with no storage (a private one)
    // and a window whose quota is full are told apart by nothing observable,
    // and the remedy — do not trust it to survive a reload — is the same.
    saved.set(false)
  }
})

const statusOf = (s?: string): IssueStatus =>
  s === 'todo' || s === 'in_progress' || s === 'done' || s === 'canceled' ? s : 'backlog'

const priorityOf = (s?: string): IssuePriority =>
  s === 'urgent' || s === 'high' || s === 'medium' || s === 'low' ? s : 'none'

const readIssues = async (): Promise<TodoItem[]> => {
  const listed = await client(ESTATE).http.collection<WireIssue>('issues', {
    path: '/v1/todo/issues',
    // The route takes a limit and most of its siblings do not, so it is sent
    // where it is accepted rather than left to the server's default.
    query: { limit: 200 },
  })
  return listed.map((one) => ({
    id: `${one.project ?? ''}#${one.number ?? 0}`,
    project: one.project ?? '',
    number: one.number ?? 0,
    text: one.title ?? '',
    status: statusOf(one.status),
    priority: priorityOf(one.priority),
    assignee: one.assignee ?? '',
    // The board sends unix SECONDS; one conversion, at the boundary.
    updatedAt: fromSeconds(one.updatedAt),
  }))
}

const readCall = async (): Promise<MeetingSession> => {
  const answer = await client(ESTATE).http.json<{
    name?: string
    ready?: boolean
    ws?: string
  }>({ method: 'GET', path: '/v1/meet/call' })
  return { name: answer.name ?? '', ready: answer.ready ?? false, ws: answer.ws ?? '' }
}

const readOverlay = async (): Promise<Overlay | null> => {
  const api = client(ESTATE).http
  const [networks, routers] = await Promise.all([
    api.collection<WireNetwork>('networks', { path: '/v1/network' }),
    api.collection<WireRouter>('routers', { path: '/v1/network/routers' }).catch(() => []),
  ])
  const one = networks[0]
  // No overlay is an ANSWER — the org holds at most one — not a failure.
  if (!one) return null
  return {
    id: one.id,
    name: one.name ?? '',
    nodes: one.nodes ?? 0,
    status: one.status ?? '',
    routers: routers.map((r) => ({
      id: r.id,
      name: r.name || r.id,
      region: r.region ?? '',
      status: r.status ?? '',
    })),
  }
}

export const workspaceAppsStore = {
  open: (which: WorkspaceAppId = 'tasks') => {
    app.set(which)
    open.set(true)
  },
  close: () => open.set(false),
  toggle: (which: WorkspaceAppId = 'tasks') =>
    open.get() ? open.set(false) : workspaceAppsStore.open(which),
  setActiveApp: (which: WorkspaceAppId) => app.set(which),

  selectNote: (id: string) => note.set(id),

  updateNoteContent: (id: string, content: string) =>
    notes.set((held) =>
      held.map((one) => (one.id === id ? { ...one, content, updatedAt: Date.now() } : one)),
    ),

  addNote: (title = 'Untitled') => {
    const one: NoteDocument = {
      id: `note_${Date.now().toString(36)}`,
      title,
      content: '',
      updatedAt: Date.now(),
    }
    notes.set((held) => [one, ...held])
    note.set(one.id)
  },

  removeNote: (id: string) => {
    const rest = notes.get().filter((one) => one.id !== id)
    notes.set(rest)
    if (note.get() === id) note.set(rest[0]?.id ?? null)
  },
}

/**
 * FOUR PRODUCTS, FOUR HOOKS. What they share is a tab strip, which is a PLACE.
 *
 * They were one hook returning seventeen fields: the notepad, the backlog, the
 * call and the overlay network, braided because they are drawn in one modal.
 * The cost was not only conceptual — a note being typed re-rendered on every
 * network read, and a panel nobody had opened was read because a sibling was.
 *
 * Each panel now reads its own, so `enabled` can say the ONE thing that is
 * true of it: the backlog is read when the backlog is showing.
 */

/** Which panel is showing, which is the only thing the four have in common. */
export const useWorkspace = () => ({
  isOpen: useAtom(open),
  activeApp: useAtom(app),
})

/** The notepad. Local, so there is no pending and no fault — only whether it
 *  is being kept. */
export const useNotes = () => ({
  notes: useAtom(notes),
  activeNoteId: useAtom(note),
  saved: useAtom(saved),
})

/** The org's backlog. */
export const useBacklog = () => {
  // Both atoms are read UNCONDITIONALLY: `a && useAtom(b)` skips the second
  // hook when the first is false, which changes hook order between renders.
  const isOpen = useAtom(open)
  const which = useAtom(app)
  const showing = isOpen && which === 'todo'
  const issues = useRead(keys.issues, readIssues, { enabled: showing })
  return {
    todos: issues.data ?? [],
    pending: issues.pending,
    fault: issues.error ? reason(issues.error) : null,
  }
}

/** Where a room's call happens. */
export const useCall = () => {
  // Both atoms are read UNCONDITIONALLY: `a && useAtom(b)` skips the second
  // hook when the first is false, which changes hook order between renders.
  const isOpen = useAtom(open)
  const which = useAtom(app)
  const showing = isOpen && which === 'meet'
  const call = useRead(keys.call, readCall, { enabled: showing })
  return { meeting: call.data ?? null, pending: call.pending }
}

/** The org's overlay on the Zero Trust fabric. */
export const useOverlay = () => {
  // Both atoms are read UNCONDITIONALLY: `a && useAtom(b)` skips the second
  // hook when the first is false, which changes hook order between renders.
  const isOpen = useAtom(open)
  const which = useAtom(app)
  const showing = isOpen && which === 'tunnel'
  const overlay = useRead(keys.network, readOverlay, { enabled: showing })
  return { overlay: overlay.data ?? null, pending: overlay.pending }
}

/**
 * Moves an issue between board columns.
 *
 * The row is re-read rather than edited in place: the board decides what a move
 * means, including refusing one. Both this list and the board go stale.
 */
export const useMoveIssue = () =>
  useSend(async (one: TodoItem, status: IssueStatus) => {
    if (!one.project) return
    await client(ESTATE).http.json({
      method: 'PATCH',
      path: `/v1/todo/projects/${one.project}/issues/${one.number}`,
      body: { status },
    })
  }, [keys.issues, keys.board('')])

/**
 * Opens an issue on a board.
 *
 * The board must be named: an issue belongs to a repository, and there is no
 * inbox to drop one into. Priority defaults to `none` rather than to a middle
 * value — an unstated urgency is not a medium one.
 */
export const useOpenIssue = () =>
  useSend(async (project: string, title: string, priority: IssuePriority = 'none') => {
    await client(ESTATE).http.json({
      method: 'POST',
      path: `/v1/todo/projects/${project.trim()}/issues`,
      body: { title: title.trim(), priority },
    })
  }, [keys.issues, keys.board('')])
