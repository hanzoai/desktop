/**
 * The org's live agent sessions, from `/v1/agents/sessions`.
 *
 * This held three literals — a CI build "✓ Bundle emitted to dist/ in 1.54s", a
 * k3s deploy at 75%, and a third — each with a hand-written log, a hand-written
 * artifact list and a progress number. `dispatchTask` prepended a fourth to the
 * array; `retryTask` set the status to 'running' and appended a line saying so;
 * `cancelTask` set it to 'failed'. None of them called anything.
 *
 * Every write here is a route: `POST /sessions` opens a run, `/pause` and
 * `/resume` steer it, `/stop` ends it with a recorded reason. THERE IS NO
 * RETRY, so there is no retry button — `PATCH` refuses to reopen a done or
 * error session, and a control button that the server would refuse is the same
 * lie as a fabricated row.
 *
 * The logs come from the detail read, which carries the 50 most recent turns.
 * They are fetched for the SELECTED session only: a list of fifty runs does not
 * need fifty transcripts, and asking for them would make opening the queue cost
 * fifty requests.
 */
import { useEffect, useState } from 'react'

import { client, ESTATE } from '~/data/origin'
import type { DurableTask, TaskEvent, TaskPhase, TaskProgress, TaskStatus } from './types'

export type { DurableTask, TaskEvent }

/** How many sessions to read. */
const page = 50

interface WireProgress {
  pct?: number
  phase?: string
  activity?: string
  at?: string
  estimated?: boolean
}

interface WireSession {
  id: string
  title?: string
  agent?: string
  status?: string
  progress?: WireProgress
  events?: number
  children?: number
  target?: string
  taskWorkflowId?: string
  repo?: string
  startedAt?: string
  endedAt?: string
  updatedAt?: string
}

interface WireEvent {
  id: string
  seq?: number
  kind?: string
  actor?: string
  createdAt?: string
  payload?: unknown
}

interface WireDetail extends WireSession {
  recentEvents?: WireEvent[]
}

export interface TaskQueueState {
  isOpen: boolean
  tasks: DurableTask[]
  activeTaskId: string | null
  /** The selected session's transcript, read on selection. */
  events: TaskEvent[]
  pending: boolean
  fault: string | null
  /** The session a control command is in flight for. */
  busy: string | null
}

let state: TaskQueueState = {
  isOpen: false,
  tasks: [],
  activeTaskId: null,
  events: [],
  pending: false,
  fault: null,
  busy: null,
}

const listeners = new Set<(s: TaskQueueState) => void>()

const put = (next: Partial<TaskQueueState>) => {
  state = { ...state, ...next }
  listeners.forEach((fn) => fn(state))
}

const because = (e: unknown): string =>
  e instanceof Error ? e.message : typeof e === 'string' ? e : 'the call failed'

/** Four words, and anything else is a run we cannot describe rather than a guess. */
const statusOf = (s?: string): TaskStatus =>
  s === 'paused' || s === 'done' || s === 'error' ? s : 'running'

const phaseOf = (s?: string): TaskPhase =>
  s === 'blocked' || s === 'done' || s === 'error' ? s : 'running'

/**
 * An absent `pct` stays null.
 *
 * `?? 0` here would be the whole bug this file exists to remove: it turns "we
 * cannot say" into "nothing has happened", which is a claim, and it reads
 * identically to a run that has genuinely not started.
 */
const progressOf = (p?: WireProgress): TaskProgress => ({
  pct: typeof p?.pct === 'number' ? p.pct : null,
  phase: phaseOf(p?.phase),
  activity: p?.activity ?? '',
  at: p?.at ?? '',
  estimated: p?.estimated ?? false,
})

const fold = (one: WireSession): DurableTask => ({
  id: one.id,
  title: one.title || one.id,
  agent: one.agent ?? '',
  status: statusOf(one.status),
  progress: progressOf(one.progress),
  events: one.events ?? 0,
  children: one.children ?? 0,
  target: one.target ?? '',
  taskWorkflowId: one.taskWorkflowId ?? '',
  repo: one.repo ?? '',
  startedAt: one.startedAt ?? '',
  endedAt: one.endedAt ?? '',
  updatedAt: one.updatedAt ?? '',
})

const read = async () => {
  put({ pending: true, fault: null })
  try {
    // With no filter this answers ROOT sessions only, so the queue shows one
    // row per flow rather than one per subagent.
    const seen = await client(ESTATE).http.collection<WireSession>('sessions', {
      path: '/v1/agents/sessions',
      query: { limit: page },
    })
    put({ tasks: seen.map(fold), pending: false })
  } catch (e) {
    put({ pending: false, fault: because(e) })
  }
}

/** The selected run's transcript. A failure costs the log, never the list. */
const readEvents = async (id: string) => {
  try {
    const full = await client(ESTATE).http.json<WireDetail>({
      method: 'GET',
      path: `/v1/agents/sessions/${id}`,
    })
    // Another selection may have landed while this was in flight.
    if (state.activeTaskId !== id) return
    put({
      events: (full.recentEvents ?? []).map((one) => ({
        id: one.id,
        seq: one.seq ?? 0,
        kind: one.kind ?? '',
        actor: one.actor ?? '',
        createdAt: one.createdAt ?? '',
        payload: one.payload,
      })),
    })
  } catch {
    if (state.activeTaskId === id) put({ events: [] })
  }
}

/**
 * One steering command, then a re-read.
 *
 * The answer says whether the command reached the durable engine as well as
 * being recorded; `forwarded: false` is NOT a failure — the intent is durable
 * either way — so it is not raised as one.
 */
const steer = async (id: string, verb: string, message?: string) => {
  put({ busy: id, fault: null })
  try {
    await client(ESTATE).http.json({
      method: 'POST',
      path: `/v1/agents/sessions/${id}/${verb}`,
      body: message ? { message } : undefined,
    })
    put({ busy: null })
    await read()
  } catch (e) {
    put({ busy: null, fault: because(e) })
  }
}

export const taskQueueStore = {
  get: (): TaskQueueState => state,
  open: () => {
    put({ isOpen: true })
    void read()
  },
  close: () => put({ isOpen: false }),
  toggle: () => (state.isOpen ? put({ isOpen: false }) : taskQueueStore.open()),
  refresh: () => void read(),

  selectTask: (id: string | null) => {
    put({ activeTaskId: id, events: [] })
    if (id) void readEvents(id)
  },

  /**
   * Opens a run.
   *
   * `agent` is the only required field: the label the surface opening the
   * session calls itself by. Nothing resolves it, so a board dispatching a card
   * under the agent that card names is stating what it knows — but the default
   * is this surface, not an invented persona. A session opens `running`.
   *
   * Nothing else is sent. A target, a repo or a workflow id made up here would
   * be recorded as fact against a run nobody dispatched that way, and `target`
   * in particular IS resolved server-side, so a made-up one is a refusal.
   */
  dispatchTask: async (title: string, agent = 'hanzo-desktop') => {
    put({ fault: null })
    try {
      await client(ESTATE).http.json({
        method: 'POST',
        path: '/v1/agents/sessions',
        body: { agent, title },
      })
      await read()
    } catch (e) {
      put({ fault: because(e) })
    }
  },

  pauseTask: (id: string) => void steer(id, 'pause'),
  resumeTask: (id: string) => void steer(id, 'resume'),

  /**
   * Ends a run, recording why.
   *
   * Stopping is not deleting: the session and its transcript stay readable,
   * which is why the reason is worth recording — it is what a later reader of
   * the log sees.
   */
  cancelTask: (id: string) => void steer(id, 'stop', 'cancelled from the desktop queue'),
}

export const useTaskQueue = (): TaskQueueState => {
  const [current, setCurrent] = useState<TaskQueueState>(state)
  useEffect(() => {
    const handler = (next: TaskQueueState) => setCurrent(next)
    listeners.add(handler)
    return () => {
      listeners.delete(handler)
    }
  }, [])
  return current
}
