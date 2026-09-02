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
import type { PluginExtension } from './types'

export type { PluginExtension }

/** One row of `GET /v1/tools/plugins`. */
interface Mount {
  name: string
  enabled?: boolean
  prefixes?: string[]
}

/** One row of `GET /v1/tools/plugins/authored`. */
interface Authored {
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
    api.collection<Mount>('plugins', { path: '/v1/tools/plugins' }).catch(() => null),
    api.collection<Authored>('plugins', { path: '/v1/tools/plugins/authored' }).catch(() => null),
  ])
  if (mounted === null && authored === null) throw new Error('neither plugin list answered')

  return [
    ...(mounted ?? []).map((one) => ({
      id: one.name,
      name: one.name,
      kind: 'mounted' as const,
      enabled: one.enabled ?? false,
      prefixes: one.prefixes ?? [],
    })),
    ...(authored ?? []).map((one) => ({
      id: one.id,
      name: one.name ?? one.id,
      kind: 'authored' as const,
      // An authored plugin is not mounted by the fleet, so there is no enabled
      // bit to read; it exists, which is what it can say.
      enabled: true,
      prefixes: [],
      provider: one.provider,
      source: one.source,
      createdAt: one.createdAt,
    })),
  ]
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
