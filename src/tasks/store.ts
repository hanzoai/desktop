/**
 * The org's live agent sessions.
 *
 * Every write is a route: `POST /sessions` opens a run, `/pause` and `/resume`
 * steer it, `/stop` ends it with a recorded reason. THERE IS NO RETRY, so there
 * is no retry verb — `PATCH` refuses to reopen a done or error session, and a
 * control the server would refuse is the same lie as a fabricated row.
 *
 * The transcript is its own KEY, per session, so selecting a run reads that
 * run's turns and nothing else re-reads. A list of fifty runs does not need
 * fifty transcripts, and the key is what expresses that rather than a flag.
 */
import { atom, useAtom } from '@hanzo/chat/data/store'
import { keys } from '~/data/keys'
import { client, ESTATE } from '@hanzo/chat/data/origin'
import { reason, useRead, useSend } from '@hanzo/chat/data/query'
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

/** Whether the panel is showing, and which run is selected in it. */
export const open = atom(false)
export const selected = atom<string | null>(null)

/** Four words, and anything else is a run we cannot describe rather than a guess. */
const statusOf = (s?: string): TaskStatus =>
  s === 'paused' || s === 'done' || s === 'error' ? s : 'running'

const phaseOf = (s?: string): TaskPhase =>
  s === 'blocked' || s === 'done' || s === 'error' ? s : 'running'

/**
 * An absent `pct` stays null.
 *
 * `?? 0` here would turn "we cannot say" into "nothing has happened", which is
 * a claim, and it reads identically to a run that has genuinely not started.
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

const readSessions = async (): Promise<DurableTask[]> => {
  // With no filter this answers ROOT sessions only, so the queue shows one row
  // per flow rather than one per subagent.
  const seen = await client(ESTATE).http.collection<WireSession>('sessions', {
    path: '/v1/agents/sessions',
    query: { limit: page },
  })
  return seen.map(fold)
}

const readEvents = async (id: string): Promise<TaskEvent[]> => {
  const full = await client(ESTATE).http.json<WireDetail>({
    method: 'GET',
    path: `/v1/agents/sessions/${id}`,
  })
  return (full.recentEvents ?? []).map((one) => ({
    id: one.id,
    seq: one.seq ?? 0,
    kind: one.kind ?? '',
    actor: one.actor ?? '',
    createdAt: one.createdAt ?? '',
    payload: one.payload,
  }))
}

export const taskQueueStore = {
  open: () => open.set(true),
  close: () => open.set(false),
  toggle: () => open.set((showing) => !showing),
  selectTask: (id: string | null) => selected.set(id),
}

export const useTaskQueue = () => {
  const isOpen = useAtom(open)
  const chosen = useAtom(selected)
  const listed = useRead(keys.sessions, readSessions, { enabled: isOpen })
  // The pane shows the selected run, or the first when nothing is selected, and
  // the transcript is read for THAT one — a per-session key, so a list of fifty
  // runs does not read fifty transcripts.
  const showing = chosen ?? listed.data?.[0]?.id ?? ''
  const turns = useRead(keys.session(showing), () => readEvents(showing), {
    enabled: isOpen && Boolean(showing),
  })

  return {
    isOpen,
    tasks: listed.data ?? [],
    activeTaskId: showing,
    // Its own read, so it carries its own answer: a transcript that was refused
    // and a run with no turns are different things, and `[]` says the second.
    // `events` is undefined until the read lands, which is neither.
    transcript: {
      events: turns.data,
      pending: turns.pending,
      fault: turns.error ? reason(turns.error) : null,
    },
    pending: listed.pending,
    fault: listed.error ? reason(listed.error) : null,
  }
}

/**
 * Opens a run.
 *
 * `agent` is the only required field: the label the surface opening the session
 * calls itself by. Nothing resolves it, so a board dispatching a card under the
 * agent that card names is stating what it knows — but the default is this
 * surface, not an invented persona.
 *
 * Nothing else is sent. A target in particular IS resolved server-side, so a
 * made-up one is a refusal.
 */
export const useOpenRun = () =>
  useSend(async (title: string, agent = 'hanzo-desktop') => {
    await client(ESTATE).http.json({
      method: 'POST',
      path: '/v1/agents/sessions',
      body: { agent, title },
    })
  }, [keys.sessions])

/**
 * Steers a run: pause, resume, or stop with a recorded reason.
 *
 * The answer says whether the command reached the durable engine as well as
 * being recorded; `forwarded: false` is NOT a failure — the intent is durable
 * either way — so it is not raised as one. Stopping is not deleting: the
 * session and its transcript stay readable, which is why the reason is worth
 * recording at all.
 */
export const useSteerRun = () =>
  useSend(async (id: string, verb: 'pause' | 'resume' | 'stop', message?: string) => {
    await client(ESTATE).http.json({
      method: 'POST',
      path: `/v1/agents/sessions/${id}/${verb}`,
      body: message ? { message } : undefined,
    })
  }, [keys.sessions])
