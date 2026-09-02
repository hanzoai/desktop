/**
 * What a plugin IS on this estate.
 *
 * Two kinds, and neither is a marketplace listing. `GET /v1/tools/plugins`
 * answers subsystems MOUNTED in the deployment — a name, whether it is switched
 * on, and the URL prefixes it serves. `GET /v1/tools/plugins/authored` answers
 * the ones this org wrote, carrying the provider whose credential they run
 * under and the TypeScript they were written as.
 *
 * So there is no version, no author, no download count, no star rating and no
 * category: nothing on the wire carries any of them, and every one of those
 * fields was a literal here before. A number nobody published is a claim, and a
 * four-point-nine next to a name reads exactly like a measurement.
 */

/** Which surface a plugin came from. It is the only thing that groups them. */
export type PluginKind = 'mounted' | 'authored'

/**
 * A subsystem this deployment mounts.
 *
 * `all=true` is what makes `enabled` mean anything: the route filters to the
 * RUNNING subsystems by default, so every row came back enabled and the off
 * state was unreachable — a mark that reports a constant while looking like it
 * reports a fact.
 */
export interface Mounted {
  kind: 'mounted'
  /** The name IS the id for a mount — what a traced request resolves to. */
  id: string
  name: string
  /** Switched on in this deployment. Only a mount has one. */
  enabled: boolean
  /** The URL prefixes it serves. */
  prefixes: string[]
}

/** A plugin this org wrote. */
export interface Authored {
  kind: 'authored'
  /** The minted id. */
  id: string
  name: string
  /** Whose credential it runs under. */
  provider: string
  /**
   * The authored plugin's TypeScript, as written.
   *
   * SOURCE CODE, not a repository URL — the route says so outright. A card
   * built to hold one line of provenance would otherwise take a whole program,
   * so it is shown as code and bounded.
   */
  source: string
  /** When it was last built, unix milliseconds — this app's one clock. */
  builtAt: number
}

/**
 * The two kinds, as a UNION rather than one record with optional halves.
 *
 * An authored plugin does not have zero prefixes and is not "switched on" — it
 * has neither concept, and the flat shape made the reader write `prefixes: []`
 * and `enabled: true` for it, both claims. With the union, reading either off
 * an authored plugin does not compile.
 */
export type PluginExtension = Mounted | Authored
