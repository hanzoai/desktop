/**
 * What the estate remembers, and what it can find in the code.
 *
 * Both halves were literals. Three memories carried a `confidence` of 0.99,
 * 1.0 and 0.98 and a `category` from a four-word set this file invented — one
 * of them "Enclave KMS Key", describing key material as a remembered fact. The
 * symbol index was six rows naming this app's own stores at fixed line numbers,
 * which the edits in this very session had already made wrong.
 *
 * A MEMORY HAS NO CONFIDENCE. `Memory` carries content, a kind, an owner and
 * two clocks; the `score` beside them is a similarity against a QUERY, so it
 * means nothing on a plain listing and is not shown on one.
 *
 * THE SYMBOL INDEX IS A SEARCH, NOT A TABLE. `/v1/code/search` fuses three
 * retrieval tiers over the org's indexed repositories, so there is a query box
 * where a fixed list used to be — and an empty query lists nothing rather than
 * inventing a starting set.
 */
import { useEffect, useState } from 'react'

import { client, ESTATE } from '~/data/origin'

export interface MemoryItem {
  /** The memory's name in the store — how it is addressed. */
  name: string
  content: string
  /** What kind of memory it is, as the store recorded it. Empty when unstated. */
  kind: string
  owner: string
  /** RFC 3339, as the wire sends it. */
  updatedTime: string
}

export interface SymbolIndexItem {
  /** The declared name, when the span declares one. */
  symbol: string
  /** What the indexer decided the chunk IS — func, method, type and so on. */
  kind: string
  file: string
  line: number
  repo: string
  snippet: string
}

interface WireMemory {
  name?: string
  content?: string
  kind?: string
  owner?: string
  updatedTime?: string
}

interface WireSpan {
  symbol?: string
  kind?: string
  file?: string
  line?: number
  repo?: string
  snippet?: string
}

export interface IntelligenceState {
  isOpen: boolean
  memories: MemoryItem[]
  symbols: SymbolIndexItem[]
  /** The query the symbol list answers. Empty means nothing was asked. */
  query: string
  activeTab: 'memory' | 'symbols'
  pending: boolean
  fault: string | null
  /** Retrieval failed, so an empty result is an outage and not an absence. */
  degraded: boolean
}

let state: IntelligenceState = {
  isOpen: false,
  memories: [],
  symbols: [],
  query: '',
  activeTab: 'memory',
  pending: false,
  fault: null,
  degraded: false,
}

const listeners = new Set<(s: IntelligenceState) => void>()

const put = (next: Partial<IntelligenceState>) => {
  state = { ...state, ...next }
  listeners.forEach((fn) => fn(state))
}

const because = (e: unknown): string =>
  e instanceof Error ? e.message : typeof e === 'string' ? e : 'the call failed'

const readMemories = async () => {
  put({ pending: true, fault: null })
  try {
    // The listing is enveloped: `{data: [...]}`.
    const listed = await client(ESTATE).http.collection<WireMemory>('data', {
      path: '/v1/ai/memory/list',
    })
    put({
      memories: listed.map((one) => ({
        name: one.name ?? '',
        content: one.content ?? '',
        kind: one.kind ?? '',
        owner: one.owner ?? '',
        updatedTime: one.updatedTime ?? '',
      })),
      pending: false,
    })
  } catch (e) {
    put({ pending: false, fault: because(e) })
  }
}

/**
 * Searches the org's indexed code.
 *
 * An empty query asks nothing: the route requires one, and a blank list is the
 * truthful answer to a question nobody asked.
 */
const readSymbols = async (query: string) => {
  if (!query.trim()) {
    put({ symbols: [], degraded: false })
    return
  }
  put({ pending: true, fault: null })
  try {
    const answer = await client(ESTATE).http.json<{
      results?: WireSpan[]
      degraded?: boolean
    }>({
      method: 'GET',
      path: '/v1/code/search',
      query: { q: query, type: 'symbol', limit: 50 },
    })
    // A later query may have landed while this was in flight.
    if (state.query !== query) return
    put({
      symbols: (answer.results ?? []).map((one) => ({
        symbol: one.symbol ?? '',
        kind: one.kind ?? '',
        file: one.file ?? '',
        line: one.line ?? 0,
        repo: one.repo ?? '',
        snippet: one.snippet ?? '',
      })),
      degraded: answer.degraded ?? false,
      pending: false,
    })
  } catch (e) {
    put({ pending: false, fault: because(e) })
  }
}

export const intelligenceStore = {
  get: (): IntelligenceState => state,
  open: () => {
    put({ isOpen: true })
    void readMemories()
  },
  close: () => put({ isOpen: false }),
  toggle: () => (state.isOpen ? put({ isOpen: false }) : intelligenceStore.open()),

  setTab: (activeTab: IntelligenceState['activeTab']) => intelligenceStore.setActiveTab(activeTab),

  setActiveTab: (activeTab: IntelligenceState['activeTab']) => {
    put({ activeTab })
    if (activeTab === 'memory' && state.memories.length === 0) void readMemories()
  },

  /**
   * Stores a memory.
   *
   * The body is `{content, kind, metadata}` and CARRIES NO IDENTITY: the owner
   * and the user are force-set server-side from the authenticated caller, which
   * is the one chokepoint that makes a stored memory the caller's. Sending
   * either would be overwritten, so neither is sent.
   *
   * Empty content is refused there, so it is refused here rather than sent to
   * be refused.
   */
  addMemory: async (content: string, kind = '') => {
    if (!content.trim()) return
    put({ fault: null })
    try {
      await client(ESTATE).http.json({
        method: 'POST',
        path: '/v1/ai/memory/remember',
        body: { content: content.trim(), kind: kind || undefined },
      })
      await readMemories()
    } catch (e) {
      put({ fault: because(e) })
    }
  },

  /** Removes one. A memory is addressed by `name`, which is what the list has. */
  deleteMemory: async (name: string) => {
    if (!name) return
    put({ fault: null })
    try {
      await client(ESTATE).http.json({
        method: 'POST',
        path: '/v1/ai/memory/delete',
        body: { name },
      })
      await readMemories()
    } catch (e) {
      put({ fault: because(e) })
    }
  },

  search: (query: string) => {
    put({ query })
    void readSymbols(query)
  },

  refresh: () =>
    state.activeTab === 'memory' ? void readMemories() : void readSymbols(state.query),
}

export const useIntelligence = (): IntelligenceState => {
  const [current, setCurrent] = useState<IntelligenceState>(state)
  useEffect(() => {
    const handler = (next: IntelligenceState) => setCurrent(next)
    listeners.add(handler)
    return () => {
      listeners.delete(handler)
    }
  }, [])
  return current
}
