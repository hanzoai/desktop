/**
 * What is connected, what it exposes, and what is switched on.
 *
 * Three reads make one view, because the estate keeps them apart: `tools.mcp()`
 * is the servers, `tools.list()` is every tool with the source it came from,
 * and `tools.activation()` is the set that is on. A tool the org has but has
 * not activated is listed and marked off rather than hidden — hiding it is how
 * somebody concludes a server is broken when it is merely switched off.
 *
 * The switch itself is not here. Activation is ONE set that this panel and the
 * skills panel both change, so its writer is `~/tools/store` and both import
 * it — a toggle per panel is two statements of one fact.
 */
import { atom, useAtom } from '@hanzo/chat/data/store'
import { keys } from '../data/keys'
import { client, ESTATE } from '@hanzo/chat/data/origin'
import { reason, useRead } from '@hanzo/chat/data/query'
import type { Connected, Exposed } from './types'

/** Servers are the org's, so they are read from the estate rather than per origin. */
const ai = () => client(ESTATE)

/** Whether the panel is showing, and which server is selected in it. */
export const open = atom(false)
export const selected = atom<string | null>(null)

const read = async (): Promise<Connected[]> => {
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

  return servers.map((s) => ({
    id: s.id,
    name: s.name ?? s.id,
    url: s.url,
    hasSecret: s.hasSecret,
    tools: bySource.get(s.id) ?? bySource.get(s.source ?? s.id) ?? [],
  }))
}

export const mcpStore = {
  open: (serverId?: string) => {
    if (serverId) selected.set(serverId)
    open.set(true)
  },
  close: () => open.set(false),
  toggle: () => open.set((showing) => !showing),
  selectServer: (id: string) => selected.set(id),
}

export const useMcp = () => {
  const isOpen = useAtom(open)
  const listed = useRead(keys.servers, read, { enabled: isOpen, fresh: 60_000 })
  const servers = listed.data ?? []
  const chosen = useAtom(selected)

  return {
    servers,
    isOpen,
    // The panel must land on a server, and the first is where — as a FALLBACK,
    // so a choice already made survives a re-read.
    activeServerId:
      chosen && servers.some((one) => one.id === chosen) ? chosen : (servers[0]?.id ?? null),
    pending: listed.pending,
    fault: listed.error ? reason(listed.error) : null,
  }
}
