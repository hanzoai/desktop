/**
 * The org's automations, from `/v1/auto`.
 *
 * This held four literals — an hourly KMS sweep, a nightly benchmark, a deploy
 * hook — each with an invented schedule, an invented agent and an invented run
 * count. `runNow` set the status to 'running' and used a two-second timer to set
 * it back, so a job that had never existed appeared to succeed.
 *
 * The writes here are real and the routes answer: `POST /flows/{id}/run` starts
 * a durable run, `/enable` arms the trigger, `/disable` disarms it. Each is
 * followed by a re-read rather than a local edit, because what the server did
 * with the request is the only thing worth showing.
 *
 * THE NAME COSTS A SECOND READ. A flow's list row carries no display name — it
 * lives on the flow's latest version — so the list is enriched by fetching each
 * flow's populated form. That read is bounded by the page and fails soft: a
 * flow whose version cannot be read is shown under its id, which is the honest
 * degradation, rather than dropped from a list of what is armed.
 */
import { useEffect, useState } from 'react'

import { client, ESTATE } from '~/data/origin'
import type { AutomationJob, AutomationRun, AutomationTrigger } from './types'

export type { AutomationJob, AutomationRun }

/** How many flows to read, and therefore how many names to fetch. */
const page = 50

interface WireFlow {
  id: string
  status?: string
  publishedVersionId?: string
  created?: number
  updated?: number
}

interface WireVersion {
  displayName?: string
  valid?: boolean
  trigger?: { displayName?: string; type?: string }
}

interface WirePopulated extends WireFlow {
  version?: WireVersion
}

interface WireRun {
  id: string
  flowId?: string
  status?: string
  startTime?: number
  finishTime?: number
}

export interface AutomationsState {
  isOpen: boolean
  jobs: AutomationJob[]
  runs: AutomationRun[]
  pending: boolean
  fault: string | null
  /** The flow a write is in flight for, so one card can show it and not the rail. */
  busy: string | null
}

let state: AutomationsState = {
  isOpen: false,
  jobs: [],
  runs: [],
  pending: false,
  fault: null,
  busy: null,
}

const listeners = new Set<(s: AutomationsState) => void>()

const put = (next: Partial<AutomationsState>) => {
  state = { ...state, ...next }
  listeners.forEach((fn) => fn(state))
}

const because = (e: unknown): string =>
  e instanceof Error ? e.message : typeof e === 'string' ? e : 'the call failed'

/** The wire spells a trigger `PIECE_TRIGGER` or `EMPTY`; anything else is empty. */
const triggerOf = (type?: string): AutomationTrigger =>
  type === 'PIECE_TRIGGER' ? 'piece' : 'empty'

const fold = (flow: WireFlow, full: WirePopulated | null): AutomationJob => ({
  id: flow.id,
  name: full?.version?.displayName || flow.id,
  status: flow.status ?? '',
  trigger: triggerOf(full?.version?.trigger?.type),
  triggerName: full?.version?.trigger?.displayName ?? '',
  valid: full?.version?.valid ?? false,
  publishedVersionId: flow.publishedVersionId ?? '',
  created: flow.created ?? 0,
  updated: flow.updated ?? 0,
})

const read = async () => {
  put({ pending: true, fault: null })
  const api = client(ESTATE).http
  try {
    const flows = await api.collection<WireFlow>('data', {
      path: '/v1/auto/flows',
      query: { limit: page },
    })

    // The names, one read each. A failure costs that flow its name and nothing
    // else — never its row, and never the whole list.
    const named = await Promise.all(
      flows.map(async (flow) => {
        const full = await api
          .json<WirePopulated>({ method: 'GET', path: `/v1/auto/flows/${flow.id}` })
          .catch(() => null)
        return fold(flow, full)
      }),
    )

    // The history is a separate question, so it does not fail the list.
    const runs = await api
      .collection<WireRun>('data', { path: '/v1/auto/runs', query: { limit: page } })
      .catch(() => [])

    put({
      jobs: named,
      runs: runs.map((one) => ({
        id: one.id,
        flowId: one.flowId ?? '',
        status: one.status ?? '',
        startTime: one.startTime ?? 0,
        finishTime: one.finishTime ?? 0,
      })),
      pending: false,
    })
  } catch (e) {
    put({ pending: false, fault: because(e) })
  }
}

/** One write, then a re-read. What the server did is the only thing to show. */
const act = async (id: string, leaf: string) => {
  put({ busy: id, fault: null })
  try {
    await client(ESTATE).http.json({ method: 'POST', path: `/v1/auto/flows/${id}/${leaf}` })
    put({ busy: null })
    await read()
  } catch (e) {
    put({ busy: null, fault: because(e) })
  }
}

export const automationsStore = {
  get: (): AutomationsState => state,
  open: () => {
    put({ isOpen: true })
    void read()
  },
  close: () => put({ isOpen: false }),
  toggle: () => (state.isOpen ? put({ isOpen: false }) : automationsStore.open()),
  refresh: () => void read(),

  /**
   * Starts one durable run now.
   *
   * The run is bounded by the org's per-minute start budget and its in-flight
   * ceiling; over either, the server starts nothing and burns no run id, and
   * says so — which is why the refusal is raised rather than swallowed.
   */
  runNow: (id: string) => void act(id, 'run'),

  /** Arms a flow's trigger, or disarms it. The status the list shows decides. */
  toggleStatus: (id: string) => {
    const job = state.jobs.find((one) => one.id === id)
    if (!job) return
    void act(id, job.status === 'ENABLED' ? 'disable' : 'enable')
  },

  /**
   * Opens an empty flow under a name.
   *
   * `displayName` names the flow's initial DRAFT version, which is where a name
   * lives. A flow may be created with no trigger and edited later, so nothing
   * else is sent — a trigger invented here would arm something nobody asked for.
   */
  create: async (name: string) => {
    put({ fault: null })
    try {
      await client(ESTATE).http.json({
        method: 'POST',
        path: '/v1/auto/flows',
        body: { displayName: name },
      })
      await read()
    } catch (e) {
      put({ fault: because(e) })
    }
  },
}

export const useAutomations = (): AutomationsState => {
  const [current, setCurrent] = useState<AutomationsState>(state)
  useEffect(() => {
    listeners.add(setCurrent)
    return () => {
      listeners.delete(setCurrent)
    }
  }, [])
  return current
}
