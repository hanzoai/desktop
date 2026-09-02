/**
 * What each cached answer is called.
 *
 * A key is a path: the general part first, the specific part last. That order is
 * the whole design — `invalidate(keys.convos)` drops every conversation and
 * every list of them, whatever any of them was filtered by, while
 * `invalidate(keys.convo(id))` drops exactly one and the turns beneath it. Two
 * things that must expire together are nested; two that must not are siblings,
 * which is why a list lives under `list` rather than beside the ids.
 *
 * They are gathered here for the same reason the URLs are gathered in `api.ts`:
 * a name written at both the read and the write is a name that can be written
 * two ways, and then a rename lands in the database and not in the sidebar.
 */

export type Key = readonly string[]

/** A filter, as a key part. Order-independent, so two equal filters are one key. */
export const sign = (filter: Record<string, unknown>): string =>
  Object.entries(filter)
    .filter(([, value]) => value != null && value !== '')
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([name, value]) => `${name}=${Array.isArray(value) ? value.join(',') : String(value)}`)
    .join('&')

export const keys = {
  models: ['models'] as Key,

  /** What an agent may dispatch. One read per origin, like the models. */
  skills: ['skills'] as Key,

  /** The org's directory, read through IAM's SCIM surface. */
  people: (owner: string) => ['people', owner] as Key,

  user: ['user'] as Key,

  convos: ['convos'] as Key,
  convoList: (filter: Record<string, unknown>) => ['convos', 'list', sign(filter)] as Key,
  convo: (id: string) => ['convos', 'one', id] as Key,
  /** Every turn of one conversation, so both drop together. */
  turns: (convoId: string) => ['convos', 'one', convoId, 'turns'] as Key,

  shares: ['shares'] as Key,
  shareList: (filter: Record<string, unknown>) => ['shares', 'list', sign(filter)] as Key,
  share: (shareId: string) => ['shares', 'one', shareId] as Key,
  shareOf: (convoId: string) => ['shares', 'of', convoId] as Key,

  mcp: ['mcp'] as Key,
  servers: ['mcp', 'servers'] as Key,
  status: ['mcp', 'status'] as Key,

  /** What this deployment mounts, and what this org authored. */
  plugins: ['plugins'] as Key,

  /** The org's flows, and the runs they have had. Both move on a run. */
  flows: ['flows'] as Key,
  runs: ['flows', 'runs'] as Key,

  /** The org's live agent sessions, and one session's transcript. */
  sessions: ['sessions'] as Key,
  session: (id: string) => ['sessions', 'one', id] as Key,

  /** The org's agents. */
  agents: ['agents'] as Key,

  /** The orgs a caller may act in, and one org's projects. */
  orgs: ['orgs'] as Key,
  projects: (owner: string) => ['orgs', 'one', owner, 'projects'] as Key,

  /** The rooms this org has. */
  rooms: ['rooms'] as Key,

  /**
   * A board, narrowed to one repository or the org's whole board.
   *
   * The key carries the narrowing, so switching board is a different key rather
   * than a re-read of the same one — which is what lets the previous board stay
   * on screen while the next one arrives, and what makes going back free.
   */
  board: (key: string) => ['board', key] as Key,

  /** The org's backlog across every project. */
  issues: ['issues'] as Key,

  /** Where a room's call happens, and the org's overlay network. */
  call: ['call'] as Key,
  network: ['network'] as Key,

  /** What the estate remembers, and one search of the code index. */
  memories: ['memories'] as Key,
  symbols: (query: string) => ['symbols', query] as Key,
} as const
