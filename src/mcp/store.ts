/**
 * What is connected, what it exposes, and what is switched on.
 *
 * Three reads make one view, because the estate keeps them apart: `tools.mcp()`
 * is the servers, `tools.list()` is every tool with the source it came from,
 * and `tools.activation()` is the set that is on. A tool the org has but has
 * not activated is listed and marked off rather than hidden — hiding it is how
 * somebody concludes a server is broken when it is merely switched off.
 *
 * **Activation is sent WHOLE.** The SDK is explicit that a name absent from
 * `enabled` is off afterwards, so a toggle reads the current set, changes one
 * name, and sends all of it. Sending the single name somebody clicked would
 * turn everything else off.
 */
import { useEffect, useState } from 'react'

import { client, ESTATE } from '~/data/origin'
import type { Connected, Exposed } from './types'

export interface McpState {
  servers: Connected[]
  /** Nothing has been read yet, or a read is in flight. */
  pending: boolean
  /** Why the last read or write failed, in the words it failed with. */
  fault: string | null
  isOpen: boolean
  activeServerId: string | null
}

let state: McpState = {
  servers: [],
  pending: false,
  fault: null,
  isOpen: false,
  activeServerId: null,
}

const listeners = new Set<(s: McpState) => void>()

const put = (next: Partial<McpState>) => {
  state = { ...state, ...next }
  listeners.forEach((fn) => fn(state))
}

const because = (e: unknown): string =>
  e instanceof Error ? e.message : typeof e === 'string' ? e : 'the call failed'

/** Servers are the org's, so they are read from the estate rather than per origin. */
const ai = () => client(ESTATE)

const read = async () => {
  put({ pending: true, fault: null })
  try {
    const [servers, tools, active] = await Promise.all([
      ai().tools.mcp(),
      ai().tools.list(),
      ai().tools.activation(),
    ])

    const on = new Set(active?.enabled ?? [])
    const bySource = new Map<string, Exposed[]>()
    for (const tool of tools) {
      if (!tool.name) continue
      const key = tool.source ?? ''
      ;(bySource.get(key) ?? bySource.set(key, []).get(key)!).push({
        name: tool.name,
        description: tool.description,
        activated: tool.activated ?? on.has(tool.name),
      })
    }

    const seen: Connected[] = servers.map((s) => ({
      id: s.id,
      name: s.name ?? s.id,
      url: s.url,
      hasSecret: s.hasSecret,
      tools: bySource.get(s.id) ?? bySource.get(s.source ?? s.id) ?? [],
    }))

    put({
      servers: seen,
      pending: false,
      activeServerId: state.activeServerId ?? seen[0]?.id ?? null,
    })
  } catch (e) {
    put({ pending: false, fault: because(e) })
  }
}

export const mcpStore = {
  get: (): McpState => state,

  open: (serverId?: string) => {
    put({ isOpen: true, activeServerId: serverId ?? state.activeServerId })
    void read()
  },

  close: () => put({ isOpen: false }),

  /** Opens or closes the modal. The keyboard reaches this one. */
  toggle: () => {
    const opening = !state.isOpen
    put({ isOpen: opening })
    if (opening) void read()
  },

  refresh: () => void read(),

  selectServer: (activeServerId: string) => put({ activeServerId }),

  /**
   * Switches one tool on or off.
   *
   * Reads the live set rather than trusting this view: another surface may have
   * changed it since, and the whole set is what gets sent.
   */
  toggleTool: async (name: string) => {
    put({ fault: null })
    try {
      const active = await ai().tools.activation()
      const on = new Set(active?.enabled ?? [])
      if (on.has(name)) on.delete(name)
      else on.add(name)
      await ai().tools.activate([...on])
      await read()
    } catch (e) {
      put({ fault: because(e) })
    }
  },
}

export const useMcp = (): McpState => {
  const [current, setCurrent] = useState<McpState>(state)
  useEffect(() => {
    const handler = (next: McpState) => setCurrent(next)
    listeners.add(handler)
    return () => {
      listeners.delete(handler)
    }
  }, [])
  return current
}
