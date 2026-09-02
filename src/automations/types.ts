/**
 * What an automation IS on this estate.
 *
 * `GET /v1/auto/flows` answers `Flow` — an id, a status, two clocks and the
 * version pinned for a run. The NAME is not on that row: it lives on the flow's
 * latest `FlowVersion`, which `GET /v1/auto/flows/{id}` carries as `version`.
 * The trigger lives there too.
 *
 * So there is no schedule string, no assigned agent, no runtime target and no
 * total-run count — every one of those was a literal here ("0 * * * * (Hourly)",
 * "@secops", "gvisor-enclave", 142). A cron expression is a property of an armed
 * POLLING trigger inside the step tree, not a column, and inventing one told an
 * operator their sweep runs on the hour when nothing runs at all.
 */

/** How a flow starts. The wire spells the type `PIECE_TRIGGER` or `EMPTY`. */
export type AutomationTrigger = 'piece' | 'empty'

export interface AutomationJob {
  id: string
  /** The latest version's display name; the id when the version is unread. */
  name: string
  /** ENABLED or DISABLED, as the flow's own status column says. */
  status: string
  trigger: AutomationTrigger
  /** The trigger's own display name — what actually starts it. Empty if none. */
  triggerName: string
  /** True when the flow's latest version passes the builder's own validation. */
  valid: boolean
  /** A run executes this version when pinned; empty means the latest runs. */
  publishedVersionId: string
  /** Unix milliseconds, as the wire sends them. */
  created: number
  updated: number
}

/** One row of `GET /v1/auto/runs`. */
export interface AutomationRun {
  id: string
  flowId: string
  status: string
  startTime: number
  finishTime: number
}
