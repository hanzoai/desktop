/**
 * Board & Sprint Issue Planning Store.
 */
import { useEffect, useState } from 'react'

export interface BoardCard {
  id: string
  title: string
  description: string
  column: 'backlog' | 'in_progress' | 'review' | 'done'
  assignedAgent: string
  priority: 'P0' | 'P1' | 'P2'
  branch?: string
}

export interface BoardState {
  isOpen: boolean
  cards: BoardCard[]
}

const DEFAULT_CARDS: BoardCard[] = [
  {
    id: 'card-1',
    title: 'Synthesize Zero-Allocation ZAP Protocol Streaming Service',
    description: 'Implement high-throughput binary protocol handlers over NATS and WebSockets.',
    column: 'done',
    assignedAgent: '@dev',
    priority: 'P0',
    branch: 'feat/zap-protocol',
  },
  {
    id: 'card-2',
    title: 'KMS Enclave AES-256-GCM Envelope Encryption Audit',
    description: 'Verify zero-trust hardware key wrapping and gVisor container sandbox boundary.',
    column: 'review',
    assignedAgent: '@secops',
    priority: 'P0',
    branch: 'security/kms-audit',
  },
  {
    id: 'card-3',
    title: 'Scaffold Autonomous Luxury Commerce Next.js 16 Storefront',
    description: 'Production storefront with sub-second hybrid vector search and pgvector.',
    column: 'in_progress',
    assignedAgent: '@planner',
    priority: 'P1',
    branch: 'feat/luxury-store',
  },
  {
    id: 'card-4',
    title: 'Setup Local k3s Multi-Container Sandboxes',
    description: 'Configure CoreDNS, Traefik v3, and isolated worker pod namespaces for agent runs.',
    column: 'backlog',
    assignedAgent: '@executor',
    priority: 'P2',
  },
]

let state: BoardState = {
  isOpen: false,
  cards: DEFAULT_CARDS,
}

const listeners = new Set<(s: BoardState) => void>()

const notify = () => {
  listeners.forEach((fn) => fn(state))
}

export const boardStore = {
  get: (): BoardState => state,

  open: () => {
    state = { ...state, isOpen: true }
    notify()
  },

  close: () => {
    state = { ...state, isOpen: false }
    notify()
  },

  toggle: () => {
    state = { ...state, isOpen: !state.isOpen }
    notify()
  },

  moveCard: (id: string, column: BoardCard['column']) => {
    state = {
      ...state,
      cards: state.cards.map((c) => (c.id === id ? { ...c, column } : c)),
    }
    notify()
  },

  addCard: (title: string, assignedAgent: string, priority: BoardCard['priority']) => {
    const newCard: BoardCard = {
      id: `card-${Date.now()}`,
      title,
      description: 'Agentic task generated from sprint planning.',
      column: 'backlog',
      assignedAgent,
      priority,
    }
    state = {
      ...state,
      cards: [newCard, ...state.cards],
    }
    notify()
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
