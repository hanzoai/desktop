/**
 * The plugins this estate mounts, and the ones this org wrote.
 *
 * Two questions and two primitives, which is the whole shape every store here
 * takes: what THIS WINDOW owns is an `atom` (is the panel open), and what the
 * SERVER owns is a `useRead` under a key. Nothing subscribes by hand.
 *
 * The panel is read only while it is open. A closed panel polling the fleet is
 * work nobody asked for, and `enabled` says so where a hand-rolled store said
 * it by calling its reader from `open()`.
 */
import { atom, useAtom } from '~/data/store'
import { keys } from '~/data/keys'
import { client, ESTATE } from '~/data/origin'
import { reason, useRead } from '~/data/query'
import type { Authored as Written, Mounted as Mount, PluginExtension } from './types'

export type { PluginExtension }

/** One row of `GET /v1/tools/plugins`. */
interface WireMount {
  name: string
  enabled?: boolean
  prefixes?: string[]
}

/** One row of `GET /v1/tools/plugins/authored`. */
interface WireAuthored {
  id: string
  name?: string
  provider?: string
  source?: string
  createdAt?: number
}

/** Whether the panel is showing. This window's, and nobody else's. */
export const open = atom(false)

const read = async (): Promise<PluginExtension[]> => {
  const api = client(ESTATE).http
  // The two reads are independent, so one failing must not cost the other its
  // list — a deployment that mounts plugins and has authored none is ordinary.
  const [mounted, authored] = await Promise.all([
    api.collection<WireMount>('plugins', { path: '/v1/tools/plugins' }).catch(() => null),
    api
      .collection<WireAuthored>('plugins', { path: '/v1/tools/plugins/authored' })
      .catch(() => null),
  ])
  if (mounted === null && authored === null) throw new Error('neither plugin list answered')

  // Each kind is built as ITSELF. Neither fills a field the other's shape
  // carries, which is what the union buys over a record with optional halves.
  const mounts: Mount[] = (mounted ?? []).map((one) => ({
    kind: 'mounted',
    id: one.name,
    name: one.name,
    enabled: one.enabled ?? false,
    prefixes: one.prefixes ?? [],
  }))
  const written: Written[] = (authored ?? []).map((one) => ({
    kind: 'authored',
    id: one.id,
    name: one.name ?? one.id,
    provider: one.provider ?? '',
    source: one.source ?? '',
    createdAt: one.createdAt ?? 0,
  }))
  return [...mounts, ...written]
}

export const pluginsStore = {
  open: () => open.set(true),
  close: () => open.set(false),
  toggle: () => open.set((showing) => !showing),
}

export const usePlugins = () => {
  const isOpen = useAtom(open)
  const listed = useRead(keys.plugins, read, { enabled: isOpen, fresh: 60_000 })
  return {
    isOpen,
    plugins: listed.data ?? [],
    pending: listed.pending,
    fault: listed.error ? reason(listed.error) : null,
  }
}
