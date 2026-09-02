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

export interface PluginExtension {
  /** The name for a mount, the minted id for an authored one. */
  id: string
  name: string
  kind: PluginKind
  /** Switched on in this deployment. A mount says so; an authored plugin is. */
  enabled: boolean
  /** The URL prefixes a mounted subsystem serves. Empty for an authored one. */
  prefixes: string[]
  /** Who runs an authored plugin, empty for a mount. */
  provider?: string
  /**
   * The authored plugin's TypeScript, as written.
   *
   * SOURCE CODE, not a repository URL — the route says so outright and this
   * said the opposite, so a card built to hold one line of provenance would
   * have taken a whole program. It is shown as code, and bounded.
   */
  source?: string
  /** When an authored plugin was last built, unix milliseconds. */
  builtAt?: number
}
