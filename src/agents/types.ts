/**
 * The org's agents, as `/v1/agents` has them.
 *
 * This file used to BE the roster: five personas — @planner, @dev, @secops,
 * @researcher, @executor — each with a hand-written system prompt, a capability
 * list, a badge colour and an avatar at `cdn.hanzo.ai/avatars/<id>.png`. That
 * host answers 525 to every path, its own bogus-path control included, so the
 * pictures had never loaded either.
 *
 * An agent is a model, a description and a set of TOOL NAMES, and the tool list
 * IS the authority on what it may call — which is why `capabilities`, a prose
 * list beside it that nothing enforced, is gone rather than renamed.
 */
export interface AgentDefinition {
  /** "agent_" + 32 hex. */
  id: string
  /** The org-unique handle. `@name` is a rendering, not a second field. */
  name: string
  description: string
  /** Always our own name for it, never an upstream's. */
  model: string
  /** What this agent may call. The list is the authority. */
  tools: string[]
  /** one-shot, or the long-running mode. */
  executionMode: string
  /** The 5-field cron a long-running agent fires on, empty when unscheduled. */
  schedule: string
  /** Readiness. Today every row reads "ready". */
  status: string
  /** How many executions the org has recorded, counted at read time. */
  runs: number
  /** An image, or the one glyph somebody picked instead. At most one is set. */
  avatar: string
  emoji: string
  updatedAt: string
}
