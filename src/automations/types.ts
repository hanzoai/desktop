/**
 * A flow is TWO values, and neither claims the other's fields.
 *
 * `GET /v1/auto/flows` answers a row: an id, a status, two clocks, the pinned
 * version. `GET /v1/auto/flows/{id}` answers that flow's latest VERSION, which
 * is where the display name, the trigger and the builder's verdict live. The
 * list cannot know the second and the second is read per row.
 *
 * They were one interface, and the list filled the half it could not know with
 * `''`, `'empty'` and `valid: false` — the last of which asserts "the builder
 * rejected this flow" about every flow the org has. A type whose producer must
 * lie to satisfy it is a type describing two things.
 */

/** How a flow starts. The wire spells the type `PIECE_TRIGGER` or `EMPTY`. */
export type AutomationTrigger = 'piece' | 'empty'

/** What the LIST row carries, and nothing more. */
export interface Flow {
  id: string
  /** ENABLED or DISABLED, as the flow's own status column says. */
  status: string
  /** A run executes this version when pinned; empty means the latest runs. */
  publishedVersionId: string
  /** Unix milliseconds, as the wire sends them. */
  created: number
  updated: number
}

/**
 * What the flow's latest VERSION carries.
 *
 * Absent until that read lands, which is why it is handed about as
 * `Version | null` rather than as a `Version` with empty fields: "not read yet"
 * and "read, and it has no trigger" are different answers and a row draws them
 * differently.
 */
export interface Version {
  /** The display name. This is the only place a flow has one. */
  name: string
  trigger: AutomationTrigger
  /** The trigger's own display name — what actually starts it. Empty if none. */
  triggerName: string
  /** The builder's own verdict on the latest version. */
  valid: boolean
}

/** One row of `GET /v1/auto/runs`. */
export interface AutomationRun {
  id: string
  flowId: string
  status: string
  startTime: number
  finishTime: number
}
