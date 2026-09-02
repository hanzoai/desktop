/**
 * What a plugin IS on this estate — TWO kinds, and a discriminant.
 *
 * `GET /v1/tools/plugins` answers subsystems MOUNTED in the deployment: a name,
 * whether it is switched on, and the URL prefixes it serves.
 * `GET /v1/tools/plugins/authored` answers the ones this org wrote, carrying the
 * provider that runs them and the source they were built from.
 *
 * They are a UNION rather than one record with optional halves. An authored
 * plugin does not have zero prefixes — it has no prefixes CONCEPT, and the flat
 * shape made the reader write `prefixes: []` for it, which is a claim. With the
 * union, reading `prefixes` off an authored plugin does not compile.
 *
 * Neither kind is a marketplace listing: there is no version, no author, no
 * download count, no star rating and no category, because nothing on the wire
 * carries any of them, and every one of those was a literal here before.
 */

/** Which surface a plugin came from. It is the only thing that groups them. */
export type PluginKind = 'mounted' | 'authored'

/** A subsystem this deployment mounts. */
export interface Mounted {
  kind: 'mounted'
  /** The name IS the id for a mount — it is what a traced request resolves to. */
  id: string
  name: string
  /** Switched on in this deployment. */
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
  /** Who runs it. */
  provider: string
  /** Where it was built from. */
  source: string
  /** When it was written, unix seconds. */
  createdAt: number
}

export type PluginExtension = Mounted | Authored
