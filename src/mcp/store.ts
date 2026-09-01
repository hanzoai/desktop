/**
 * Reactive store for MCP Servers and Skills connectors.
 */
import { useEffect, useState } from 'react'
import { DEFAULT_MCP_SERVERS, type McpServer } from './types'

export interface McpState {
  servers: McpServer[]
  isOpen: boolean
  activeServerId: string | null
}

let state: McpState = {
  servers: [...DEFAULT_MCP_SERVERS],
  isOpen: false,
  activeServerId: null,
}

const listeners = new Set<(s: McpState) => void>()

const notify = () => {
  listeners.forEach((fn) => fn(state))
}

export const mcpStore = {
  get: (): McpState => state,

  open: (serverId?: string) => {
    state = {
      ...state,
      isOpen: true,
      activeServerId: serverId || state.activeServerId || state.servers[0]?.id || null,
    }
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

  selectServer: (id: string) => {
    state = { ...state, activeServerId: id }
    notify()
  },

  toggleServerStatus: (id: string) => {
    state = {
      ...state,
      servers: state.servers.map((s) =>
        s.id === id
          ? {
              ...s,
              status: s.status === 'connected' ? 'disabled' : 'connected',
            }
          : s,
      ),
    }
    notify()
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
