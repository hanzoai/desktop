/**
 * The org's board, from `/v1/todo/board`.
 *
 * This held four literals — "Synthesize Zero-Allocation ZAP Protocol Streaming
 * Service", "KMS Enclave AES-256-GCM Envelope Encryption Audit" and two more —
 * each with an invented branch name and an invented agent. `moveCard` edited the
 * array and `addCard` prepended to it; neither called anything, so a card
 * dragged to done was done only on this screen.
 *
 * WHICH BOARD IS A FILTER, NOT AN ADDRESS. Left unbound the route answers the
 * ORG's whole board; bound to a repository it answers that project's. So the
 * default here is unbound, which is the view a person opening a board without
 * choosing one means.
 *
 * FIVE COLUMNS AND THE WIRE'S OWN SPELLING. The board is backlog, todo,
 * in_progress, done and `canceled` — one L, which is what the route accepts and
 * what it refuses a 400 for otherwise. There is no "review" column; that was
 * this file's own.
 */
import { useEffect, useState } from 'react'

import { client, ESTATE } from '~/data/origin'

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

export interface BoardState {
  isOpen: boolean
  cards: BoardCard[]
  /** The repository the board is narrowed to; empty is the org's whole board. */
  key: string
  pending: boolean
  fault: string | null
}

let state: BoardState = { isOpen: false, cards: [], key: '', pending: false, fault: null }
const listeners = new Set<(s: BoardState) => void>()

const put = (next: Partial<BoardState>) => {
  state = { ...state, ...next }
  listeners.forEach((fn) => fn(state))
}

const because = (e: unknown): string =>
  e instanceof Error ? e.message : typeof e === 'string' ? e : 'the call failed'

const columnOf = (s?: string): BoardColumn =>
  s === 'todo' || s === 'in_progress' || s === 'done' || s === 'canceled' ? s : 'backlog'

const priorityOf = (s?: string): BoardPriority =>
  s === 'urgent' || s === 'high' || s === 'medium' || s === 'low' ? s : 'none'

const read = async () => {
  put({ pending: true, fault: null })
  try {
    // The board answers a BARE ARRAY, not an envelope, so this is `json` and
    // not `collection` — asking for a key that is not there reads as empty.
    const listed = await client(ESTATE).http.json<WireIssue[]>({
      method: 'GET',
      path: '/v1/todo/board',
      query: state.key ? { key: state.key } : undefined,
    })
    put({
      cards: (listed ?? []).map((one) => ({
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
      })),
      pending: false,
    })
  } catch (e) {
    put({ pending: false, fault: because(e) })
  }
}

export const boardStore = {
  get: (): BoardState => state,
  open: () => {
    put({ isOpen: true })
    void read()
  },
  close: () => put({ isOpen: false }),
  toggle: () => (state.isOpen ? put({ isOpen: false }) : boardStore.open()),
  refresh: () => void read(),

  /** Narrows the board to one repository, or widens it back to the org's. */
  setKey: (key: string) => {
    put({ key })
    void read()
  },

  /**
   * Moves a card to another column.
   *
   * The row is re-read rather than edited in place: on a forge issue the column
   * is read off a LABEL, so what the move means is the board's to say — and a
   * closed forge issue reads done whatever its labels are.
   */
  moveCard: async (id: string, column: BoardColumn) => {
    const card = state.cards.find((one) => one.id === id)
    if (!card?.projectKey) return
    put({ fault: null })
    try {
      await client(ESTATE).http.json({
        method: 'PATCH',
        path: `/v1/todo/projects/${card.projectKey}/issues/${card.number}`,
        body: { status: column },
      })
      await read()
    } catch (e) {
      put({ fault: because(e) })
    }
  },

  /**
   * Opens a card on a board.
   *
   * The board must be named — an issue belongs to a repository and there is no
   * inbox — so a card cannot be added while the view is the org's whole board
   * unless the caller says which repository it is for.
   */
  addCard: async (key: string, title: string, priority: BoardPriority = 'none') => {
    if (!key.trim() || !title.trim()) return
    put({ fault: null })
    try {
      await client(ESTATE).http.json({
        method: 'POST',
        path: `/v1/todo/projects/${key.trim()}/issues`,
        body: { title: title.trim(), priority },
      })
      await read()
    } catch (e) {
      put({ fault: because(e) })
    }
  },
}

export const useBoard = (): BoardState => {
  const [current, setCurrent] = useState<BoardState>(state)
  useEffect(() => {
    const handler = (next: BoardState) => setCurrent(next)
    listeners.add(handler)
    return () => {
      listeners.delete(handler)
    }
  }, [])
  return current
}
