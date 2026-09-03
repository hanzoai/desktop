/**
 * The org's automations, from `/v1/auto`.
 *
 * The writes are real routes: `POST /flows/{id}/run` starts a durable run,
 * `/enable` arms the trigger, `/disable` disarms it. Each names the keys it
 * makes stale rather than calling its own reader again — a write that re-reads
 * by hand is a second statement of what it changed, and the two drift.
 *
 * THE NAME COSTS A SECOND READ, AND IT IS PER ROW. A flow's list row carries no
 * display name — it lives on the flow's latest version, and `GET /v1/auto/flows`
 * takes only `limit`, so there is no populate to ask for. Enriching the whole
 * page on open was 1 + N requests before anybody had looked at anything.
 *
 * So the name is its own KEY per flow (`keys.flow(id)`) and each ROW reads its
 * own. The cache makes that one request per flow that is actually drawn,
 * deduplicated and never repeated; a row scrolled past costs nothing. It still
 * fails soft — a flow whose version cannot be read shows under its id, which is
 * the honest degradation rather than dropping it from a list of what is armed.
 */
import { atom, useAtom } from '@hanzo/chat/data/store'
import { keys } from '../data/keys.ts'
import { client, ESTATE } from '@hanzo/chat/data/origin'
import { reason, useRead, useSend } from '@hanzo/chat/data/query'
import type { AutomationTrigger, Flow, Version } from './types.ts'

export type { Flow, Version }

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

/** One row of `GET /v1/auto/runs`, as far as a clock goes. Unix milliseconds. */
interface WireRun {
  startTime?: number
  finishTime?: number
}

/** Whether the panel is showing. */
export const open = atom(false)

/** The wire spells a trigger `PIECE_TRIGGER` or `EMPTY`; anything else is empty. */
const triggerOf = (type?: string): AutomationTrigger =>
  type === 'PIECE_TRIGGER' ? 'piece' : 'empty'

const readFlows = async (): Promise<Flow[]> => {
  const flows = await client(ESTATE).http.collection<WireFlow>('data', {
    path: '/v1/auto/flows',
    query: { limit: page },
  })
  // Everything the LIST row carries, and nothing it does not.
  return flows.map((flow) => ({
    id: flow.id,
    status: flow.status ?? '',
    publishedVersionId: flow.publishedVersionId ?? '',
    created: flow.created ?? 0,
    updated: flow.updated ?? 0,
  }))
}

/** One flow's name and trigger, read when a row is drawn and cached after. */
const readFlow = async (id: string): Promise<WirePopulated> =>
  client(ESTATE).http.json<WirePopulated>({ method: 'GET', path: `/v1/auto/flows/${id}` })

/** When one flow last ran, or null when it never has. */
const readLastRun = async (id: string): Promise<number | null> => {
  const [last] = await client(ESTATE).http.collection<WireRun>('data', {
    path: '/v1/auto/runs',
    query: { flowId: id, limit: 1 },
  })
  if (!last) return null
  return last.finishTime || last.startTime || null
}

export const automationsStore = {
  open: () => open.set(true),
  close: () => open.set(false),
  toggle: () => open.set((showing) => !showing),
}

/**
 * A flow's latest version — its name, its trigger, its verdict.
 *
 * Called from the ROW, so a flow nobody drew is a flow nobody fetched.
 *
 * NULL UNTIL IT LANDS, and that is the point of the return type: a row that has
 * not read yet and a row whose version has no trigger are different, and
 * flattening them into a `Version` with empty fields is what let `valid: false`
 * be asserted about a flow nobody had asked about.
 */
export const useVersion = (id: string): Version | null => {
  const full = useRead(keys.flow(id), () => readFlow(id), { fresh: 300_000 })
  const version = full.data?.version
  if (!version) return null
  return {
    name: version.displayName || id,
    trigger: triggerOf(version.trigger?.type),
    triggerName: version.trigger?.displayName ?? '',
    valid: version.valid ?? false,
  }
}

export const useAutomations = () => {
  const isOpen = useAtom(open)
  const flows = useRead(keys.flows, readFlows, { enabled: isOpen })

  return {
    isOpen,
    jobs: flows.data ?? [],
    pending: flows.pending,
    fault: flows.error ? reason(flows.error) : null,
  }
}

/**
 * When one flow last ran.
 *
 * NARROWED TO THE FLOW, and the route answers newest first, so one row is the
 * last run and no rows is a flow that has never run. Read off the ORG's page
 * this could only ever say "not among the newest fifty runs of every flow" —
 * which is what was drawn as "never". Per row, like the name above it, and a
 * separate key so a failure here costs the clock and not the list.
 */
export const useLastRun = (id: string) => {
  const seen = useRead(keys.runs(id), () => readLastRun(id), { fresh: 60_000 })
  // `at` is undefined until the read lands and null for a flow that has never
  // run: three answers, and the row says which one it has.
  return { at: seen.data, fault: seen.error ? reason(seen.error) : null }
}

/**
 * Starts one durable run now.
 *
 * The run is bounded by the org's per-minute start budget and its in-flight
 * ceiling; over either, the server starts nothing and burns no run id. Both
 * keys go stale, because a run changes the history AND the flow's own clock.
 */
export const useRunFlow = () =>
  useSend(async (id: string) => {
    await client(ESTATE).http.json({ method: 'POST', path: `/v1/auto/flows/${id}/run` })
  }, [keys.flows])

/** Arms a flow's trigger, or disarms it. The status the list shows decides. */
export const useArmFlow = () =>
  useSend(async (id: string, armed: boolean) => {
    await client(ESTATE).http.json({
      method: 'POST',
      path: `/v1/auto/flows/${id}/${armed ? 'disable' : 'enable'}`,
    })
  }, [keys.flows])

/**
 * Opens an empty flow under a name.
 *
 * `displayName` names the flow's initial DRAFT version, which is where a name
 * lives. A flow may be created with no trigger and edited later, so nothing
 * else is sent — a trigger invented here would arm something nobody asked for.
 */
export const useOpenFlow = () =>
  useSend(async (name: string) => {
    await client(ESTATE).http.json({
      method: 'POST',
      path: '/v1/auto/flows',
      body: { displayName: name },
    })
  }, [keys.flows])
