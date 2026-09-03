/**
 * The org's board, from `/v1/todo/board`.
 *
 * WHICH BOARD IS A FILTER, NOT AN ADDRESS. Left unbound the route answers the
 * ORG's whole board; bound to a repository it answers that project's. The
 * narrowing therefore rides the KEY (`keys.board(key)`) rather than a field in
 * a state object — so switching board is a different cache entry, the previous
 * board stays on screen while the next arrives, and going back is free.
 *
 * FIVE COLUMNS AND THE WIRE'S OWN SPELLING: backlog, todo, in_progress, done
 * and `canceled` — one L, which is what the route accepts and what it refuses a
 * 400 for otherwise. There is no "review" column; that was this app's.
 */
import { atom, useAtom } from '@hanzo/chat/data/store'
import { keys } from '../data/keys.ts'
import { client, ESTATE } from '@hanzo/chat/data/origin'
import { reason, useRead, useSend } from '@hanzo/chat/data/query'

/** The board's columns, in the order it lists them. */
export type BoardColumn = 'backlog' | 'todo' | 'in_progress' | 'done' | 'canceled'

/** urgent, high, medium, low or none — never P0/P1/P2, which was this file's. */
export type BoardPriority = 'urgent' | 'high' | 'medium' | 'low' | 'none'

export interface BoardCard {
  /** "<key>#<number>" — the human handle, and how a row is addressed. */
  id: string
  /** The board this is on: the repository name for a forge issue. */
  projectKey: string
  number: number
  title: string
  description: string
  column: BoardColumn
  priority: BoardPriority
  /** Who holds the work — an IAM username or an agent's name. Empty if nobody. */
  assignee: string
  /** issue, pr or epic. Set once at create. */
  kind: string
  /** The git repository the item is bound to, empty when it is not. */
  repo: string
  labels: string[]
}

interface WireIssue {
  identifier?: string
  projectKey?: string
  number?: number
  title?: string
  description?: string
  status?: string
  priority?: string
  assignee?: string
  kind?: string
  repo?: string
  labels?: string[]
}

/** Whether the panel is showing, and which repository it is narrowed to. */
export const open = atom(false)
export const board = atom('')

const columnOf = (s?: string): BoardColumn =>
  s === 'todo' || s === 'in_progress' || s === 'done' || s === 'canceled' ? s : 'backlog'

const priorityOf = (s?: string): BoardPriority =>
  s === 'urgent' || s === 'high' || s === 'medium' || s === 'low' ? s : 'none'

const read = async (key: string): Promise<BoardCard[]> => {
  // The board answers a BARE ARRAY, not an envelope, so this is `json` and not
  // `collection` — asking for a key that is not there would read as empty.
  const listed = await client(ESTATE).http.json<WireIssue[]>({
    method: 'GET',
    path: '/v1/todo/board',
    query: key ? { key } : undefined,
  })
  return (listed ?? []).map((one) => ({
    id: one.identifier || `${one.projectKey ?? ''}#${one.number ?? 0}`,
    projectKey: one.projectKey ?? '',
    number: one.number ?? 0,
    title: one.title ?? '',
    description: one.description ?? '',
    column: columnOf(one.status),
    priority: priorityOf(one.priority),
    assignee: one.assignee ?? '',
    kind: one.kind ?? 'issue',
    repo: one.repo ?? '',
    labels: one.labels ?? [],
  }))
}

export const boardStore = {
  open: () => open.set(true),
  close: () => open.set(false),
  toggle: () => open.set((showing) => !showing),
  /** Narrows to one repository, or widens back to the org's whole board. */
  setKey: (key: string) => board.set(key),
}

export const useBoard = () => {
  const isOpen = useAtom(open)
  const key = useAtom(board)
  const listed = useRead(keys.board(key), () => read(key), { enabled: isOpen })
  return {
    isOpen,
    key,
    cards: listed.data ?? [],
    pending: listed.pending,
    fault: listed.error ? reason(listed.error) : null,
  }
}

/**
 * Moves a card to another column.
 *
 * On a forge issue the column is read off a LABEL, so what a move MEANS is the
 * board's to say — and a closed forge issue reads done whatever its labels are.
 * Both the narrowed board and the org's whole board go stale, because a card
 * that moved is on both.
 */
export const useMoveCard = () => {
  const key = useAtom(board)
  return useSend(
    async (card: BoardCard, column: BoardColumn) => {
      if (!card.projectKey) return
      await client(ESTATE).http.json({
        method: 'PATCH',
        path: `/v1/todo/projects/${card.projectKey}/issues/${card.number}`,
        body: { status: column },
      })
    },
    [keys.board(key), keys.board(''), keys.issues],
  )
}

/**
 * Opens a card on a board.
 *
 * The board must be NAMED — an issue belongs to a repository and there is no
 * inbox — so a card cannot be added while the view is the org's whole board
 * unless the caller says which repository it is for.
 */
export const useOpenCard = () => {
  const key = useAtom(board)
  return useSend(
    async (on: string, title: string, priority: BoardPriority = 'none') => {
      await client(ESTATE).http.json({
        method: 'POST',
        path: `/v1/todo/projects/${on.trim()}/issues`,
        body: { title: title.trim(), priority },
      })
    },
    [keys.board(key), keys.board(''), keys.issues],
  )
}
