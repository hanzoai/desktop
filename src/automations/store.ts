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
import { atom, useAtom } from '~/data/store'
import { keys } from '~/data/keys'
import { client, ESTATE } from '~/data/origin'
import { reason, useRead, useSend } from '~/data/query'
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

/** Whether the panel is showing. */
export const open = atom(false)

/** The wire spells a trigger `PIECE_TRIGGER` or `EMPTY`; anything else is empty. */
const triggerOf = (type?: string): AutomationTrigger =>
  type === 'PIECE_TRIGGER' ? 'piece' : 'empty'

const readFlows = async (): Promise<AutomationJob[]> => {
  const flows = await client(ESTATE).http.collection<WireFlow>('data', {
    path: '/v1/auto/flows',
    query: { limit: page },
  })
  // Everything the LIST row carries, and nothing it does not. The name and the
  // trigger arrive per row, through `useFlow`.
  return flows.map((flow) => ({
    id: flow.id,
    name: '',
    status: flow.status ?? '',
    trigger: 'empty' as AutomationTrigger,
    triggerName: '',
    valid: false,
    publishedVersionId: flow.publishedVersionId ?? '',
    created: flow.created ?? 0,
    updated: flow.updated ?? 0,
  }))
}

/** One flow's name and trigger, read when a row is drawn and cached after. */
const readFlow = async (id: string): Promise<WirePopulated> =>
  client(ESTATE).http.json<WirePopulated>({ method: 'GET', path: `/v1/auto/flows/${id}` })

const readRuns = async (): Promise<AutomationRun[]> => {
  const listed = await client(ESTATE).http.collection<WireRun>('data', {
    path: '/v1/auto/runs',
    query: { limit: page },
  })
  return listed.map((one) => ({
    id: one.id,
    flowId: one.flowId ?? '',
    status: one.status ?? '',
    startTime: one.startTime ?? 0,
    finishTime: one.finishTime ?? 0,
  }))
}

export const automationsStore = {
  open: () => open.set(true),
  close: () => open.set(false),
  toggle: () => open.set((showing) => !showing),
}

/**
 * A row's own name and trigger.
 *
 * Called from the row, so a flow nobody drew is a flow nobody fetched. A read
 * that fails leaves the row under its id rather than removing it.
 */
export const useFlow = (id: string): Pick<AutomationJob, 'name' | 'trigger' | 'triggerName' | 'valid'> => {
  const full = useRead(keys.flow(id), () => readFlow(id), { fresh: 300_000 })
  return {
    name: full.data?.version?.displayName || id,
    trigger: triggerOf(full.data?.version?.trigger?.type),
    triggerName: full.data?.version?.trigger?.displayName ?? '',
    valid: full.data?.version?.valid ?? false,
  }
}

export const useAutomations = () => {
  const isOpen = useAtom(open)
  const flows = useRead(keys.flows, readFlows, { enabled: isOpen })
  // The history is a SEPARATE key, so a failure there costs the history and not
  // the list of what is armed.
  const runs = useRead(keys.runs, readRuns, { enabled: isOpen })

  return {
    isOpen,
    jobs: flows.data ?? [],
    runs: runs.data ?? [],
    pending: flows.pending,
    fault: flows.error ? reason(flows.error) : null,
  }
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
