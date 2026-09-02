/**
 * A task IS a live agent session.
 *
 * `GET /v1/agents/sessions` answers the org's runs, each with its event count,
 * its direct-child count, a one-line preview of its latest turn, and how far
 * along it is. That is the whole of what a queue card can honestly show.
 *
 * THREE FIELDS ARE GONE BECAUSE NOTHING PUBLISHES THEM: `retries`/`maxRetries`
 * (there is no retry — a finished session stays finished, and `PATCH` refuses to
 * reopen a done or error run), `trigger` (the closed `ci_cd | agent_swarm | cron`
 * set was invented; what the wire has is a run-TARGET and, when the run is
 * durable, a workflow id), and `artifacts` (a session records turns, not files).
 * Each was a literal here.
 */

/** Exactly four, as the server states them. */
export type TaskStatus = 'running' | 'paused' | 'done' | 'error'

/** What shape a run is in, which is not the same question as its status. */
export type TaskPhase = 'running' | 'blocked' | 'done' | 'error'

export interface TaskProgress {
  /**
   * How much of the run is done, 0 to 100 — or NULL when it is indeterminate.
   *
   * Null and zero are different answers and the wire keeps them apart: the
   * field is absent rather than 0 when nobody can say. Rendering a missing
   * value as an empty bar reads as "nothing has happened yet", which is the one
   * thing it does not mean.
   */
  pct: number | null
  phase: TaskPhase
  /** What the run is doing right now, one line. Empty when unstated. */
  activity: string
  /** When this was determined, RFC 3339. */
  at: string
  /**
   * A MODEL produced this, from the run's transcript — it is not a measurement.
   * The server marks it and so must the card: an estimate rendered as a fact
   * tells somebody a stuck run is fine.
   */
  estimated: boolean
}

export interface DurableTask {
  id: string
  /** The human line, or the id when the run has no title. */
  title: string
  /** The label the surface running this session calls itself by. */
  agent: string
  status: TaskStatus
  progress: TaskProgress
  /** How many turns the log holds, counted at read time. */
  events: number
  /** Direct fan-out — how many sessions name this one as their parent. */
  children: number
  /** The run-target it is dispatched to, empty when detached. */
  target: string
  /** Set when a durable workflow executes this run. */
  taskWorkflowId: string
  /** The code being worked on, as the surface reported it. */
  repo: string
  startedAt: string
  endedAt: string
  updatedAt: string
}

/** One turn of a session's transcript. */
export interface TaskEvent {
  id: string
  seq: number
  /** message | tool-call | tool-result | progress | control | error. */
  kind: string
  actor: string
  createdAt: string
  payload: unknown
}
