/**
 * The plugins this estate mounts, and the ones this org wrote.
 *
 * This held five literals — "GitHub Actions & CI/CD Trigger v2.4.1 by Hanzo
 * Labs, 14.2k downloads, 4.9 stars" and four like it — and `toggleInstall`
 * flipped a boolean in memory and called nothing. There is no marketplace to
 * install from: `/v1/tools/plugins` lists what the deployment MOUNTS, and
 * `/v1/tools/plugins/authored` lists what the org BUILT.
 *
 * Whether a subsystem is switched on is the deployment's decision, made by an
 * operator against the fleet and not by a person clicking a card here, so this
 * reads and does not write. A toggle that changed nothing was the more
 * misleading of the two.
 */
import { useEffect, useState } from 'react'

import { client, ESTATE } from '~/data/origin'
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

export interface PluginsState {
  isOpen: boolean
  plugins: PluginExtension[]
  pending: boolean
  fault: string | null
}

let state: PluginsState = { isOpen: false, plugins: [], pending: false, fault: null }
const listeners = new Set<(s: PluginsState) => void>()

const put = (next: Partial<PluginsState>) => {
  state = { ...state, ...next }
  listeners.forEach((fn) => fn(state))
}

const because = (e: unknown): string =>
  e instanceof Error ? e.message : typeof e === 'string' ? e : 'the call failed'

const read = async () => {
  put({ pending: true, fault: null })
  const api = client(ESTATE).http
  try {
    // The two reads are independent, so one failing must not cost the other its
    // list — a deployment that mounts plugins and has authored none is ordinary.
    const [mounted, authored] = await Promise.all([
      api.collection<Mount>('plugins', { path: '/v1/tools/plugins' }).catch(() => null),
      api.collection<Authored>('plugins', { path: '/v1/tools/plugins/authored' }).catch(() => null),
    ])
    if (mounted === null && authored === null) throw new Error('neither plugin list answered')

    const seen: PluginExtension[] = [
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
        // An authored plugin is not mounted by the fleet, so there is no
        // enabled bit to read; it exists, which is what it can say.
        enabled: true,
        prefixes: [],
        provider: one.provider,
        source: one.source,
        createdAt: one.createdAt,
      })),
    ]
    put({ plugins: seen, pending: false })
  } catch (e) {
    put({ pending: false, fault: because(e) })
  }
}

export const pluginsStore = {
  get: (): PluginsState => state,
  open: () => {
    put({ isOpen: true })
    void read()
  },
  close: () => put({ isOpen: false }),
  /** Opening re-reads, so the list is never a cached claim about the fleet. */
  toggle: () => (state.isOpen ? put({ isOpen: false }) : pluginsStore.open()),
  refresh: () => void read(),
}

export const usePlugins = (): PluginsState => {
  const [current, setCurrent] = useState<PluginsState>(state)
  useEffect(() => {
    listeners.add(setCurrent)
    return () => {
      listeners.delete(setCurrent)
    }
  }, [])
  return current
}
