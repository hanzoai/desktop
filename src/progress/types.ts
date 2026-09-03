/**
 * How far along a run is.
 *
 * The wire's own shape (`sessionProgress`), and the one this app draws from at
 * every depth — a root run, one of its subagents, or a card pinned to a board.
 *
 * **`pct` IS NULL WHEN NOBODY CAN SAY, and that is the whole contract.** The
 * route documents the key as ABSENT rather than zero for an indeterminate run,
 * because a bar drawn at 0% and a bar that should not be drawn look identical
 * and mean opposite things.
 *
 * **`estimated` says who produced the number.** A `progress` turn appended by
 * the running agent is the run's OWN word and reads false; a value read off the
 * transcript by a model reads true. Both are useful and they are not the same
 * claim, so a bar draws them differently rather than averaging them into one
 * confident stripe.
 */

/** What shape a run is in. `unknown` when nothing could be told. */
export type Phase = 'running' | 'blocked' | 'done' | 'error' | 'unknown'

export interface Progress {
  /** 0 to 100, or NULL when indeterminate. Never defaulted to zero. */
  pct: number | null
  phase: Phase
  /** One line saying what it is doing right now. Empty when unstated. */
  activity: string
  /** When this was determined, RFC 3339. */
  at: string
  /** A MODEL produced this from the transcript; it may be wrong. */
  estimated: boolean
}

/** A run, with only what a bar and a card need. */
export interface Run {
  id: string
  title: string
  agent: string
  status: 'running' | 'paused' | 'done' | 'error'
  progress: Progress
  /** DIRECT fan-out — how many runs name this one as their parent. */
  children: number
  /** The top of this run's tree. A root names itself. */
  rootId: string
  parentId: string
  events: number
  startedAt: string
  updatedAt: string
}

/** A run and its subagents, each a whole node. */
export interface Node {
  run: Run
  children: Node[]
}

/** Exactly five words, and anything else is a phase we cannot describe. */
export const phaseOf = (s?: string): Phase =>
  s === 'running' || s === 'blocked' || s === 'done' || s === 'error' ? s : 'unknown'

/**
 * The wire's progress, folded.
 *
 * An absent `pct` STAYS null. `?? 0` here is the one line that would turn "we
 * cannot say" into "nothing has happened", and the two are indistinguishable
 * once drawn.
 */
export const progressOf = (p?: {
  pct?: number
  phase?: string
  activity?: string
  at?: string
  estimated?: boolean
}): Progress => ({
  pct: typeof p?.pct === 'number' ? p.pct : null,
  phase: phaseOf(p?.phase),
  activity: p?.activity ?? '',
  at: p?.at ?? '',
  estimated: p?.estimated ?? false,
})

/**
 * A parent's progress from its subtasks, when the parent has none of its own.
 *
 * The MEAN of the children that can say, and null when none of them can — a
 * parent with three indeterminate children is itself indeterminate, not 0%.
 * Children that cannot say are left OUT of the mean rather than counted as
 * zero, because a run nobody has heard from is not a run that has done nothing.
 *
 * It is only ever a fallback: a parent that reports its own progress is
 * believed over any sum of its parts, since it is the only one that knows how
 * much of its goal the parts represent.
 */
export const rollUp = (children: Progress[]): number | null => {
  const said = children.map((one) => one.pct).filter((n): n is number => n !== null)
  if (said.length === 0) return null
  return Math.round(said.reduce((a, b) => a + b, 0) / said.length)
}
