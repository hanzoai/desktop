/**
 * What a skill IS, and why it is not a tool.
 *
 * `GET /v1/tools/skills` is the registry narrowed to one source — the brand's
 * embedded catalogue plus the org's own — each entry carrying the activation
 * flag an agent discovers it by. `GET /v1/tools/skills/authored` is the
 * editable half: this org's alone, carrying the SKILL.md body the registry view
 * omits.
 *
 * **A skill is never dispatched.** Both providers register every entry
 * `dispatchable: false`, because a skill is discovery and activation metadata
 * attached to an agent rather than something a turn calls. So activating one
 * changes what an agent KNOWS, and the composer's `/` menu — which inserts a
 * name to be called — cannot contain a skill and never could.
 *
 * The two views join by NAME, and the registry PREFIXES: a skill written as
 * `triage` is registered as `skill_triage`. That prefixed name is what
 * activation is sent under, which is why both names are kept here.
 */
export interface Skill {
  /** The name in the registry, `skill_`-prefixed. What activation is sent as. */
  id: string
  /** The name as written, which is what a person reads. */
  name: string
  description?: string
  /** Discoverable by this org's agents today. */
  activated: boolean
  /** This org wrote it, so it has a body and can be read whole. */
  authored: boolean
  /** The SKILL.md body. Only an authored skill carries one. */
  content?: string
  /** When it was last written, unix milliseconds. Authored only. */
  writtenAt?: number
}
