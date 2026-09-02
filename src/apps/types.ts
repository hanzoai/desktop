/**
 * The workspace suite, and which parts of it the estate actually serves.
 *
 * Measured against the published contract, with a bogus path as the control:
 *
 *     GET  /v1/todo/issues                 the org's backlog, every project
 *     POST /v1/todo/projects/{key}/issues  opens one
 *     GET  /v1/meet/call                   where a room's call happens
 *     GET  /v1/network                     the org's overlay on the ZT fabric
 *     GET  /v1/network/routers             its edge-routers
 *     (no /v1/notes at any depth)
 *
 * So NOTES ARE LOCAL. There is no note API, and a document held in this window
 * has no collaborators — the `collaborators: ['user_self', 'agent_planner']` the
 * note rows carried was a literal, and it said the opposite of the truth.
 *
 * A MEETING HAS NO ROSTER AND NO TRANSCRIPT HERE. `/v1/meet/call` answers three
 * facts — the media room to join, whether this deployment can mint a token for
 * it, and the address a client opens — and nothing about who is in it. The
 * participant list, the running transcript and the `aiSummary` were invented.
 *
 * A TUNNEL IS AN OVERLAY NETWORK, not a shared localhost. The fabric answers a
 * router count and a status; it publishes no forwarding URL, no local port, no
 * client count and no key. `enclaveKey: 'kms-gvisor-ec25519-7f39a0'` was a
 * literal shaped like key material, which is the worst thing a screen can show.
 */

export type WorkspaceAppId = 'tasks' | 'todo' | 'notes' | 'meet' | 'tabs' | 'tunnel'

/** A document held in this window. Nothing syncs it and nothing else sees it. */
export interface NoteDocument {
  id: string
  title: string
  content: string
  /** Unix milliseconds, stamped locally when it was last edited. */
  updatedAt: number
}

/** The board's own five words, in the order the wire lists them. */
export type IssuePriority = 'none' | 'urgent' | 'high' | 'medium' | 'low'

/** The board columns, likewise. */
export type IssueStatus = 'backlog' | 'todo' | 'in_progress' | 'done' | 'canceled'

export interface TodoItem {
  /** `<project>#<number>` — the pair that addresses a row on its board. */
  id: string
  /** The board this is on. */
  project: string
  number: number
  text: string
  status: IssueStatus
  priority: IssuePriority
  /** Who holds the work, empty when nobody does. */
  assignee: string
}

/** Where a room's call happens, resolved at the moment a surface draws one. */
export interface MeetingSession {
  /** The media room to join. */
  name: string
  /** This deployment can mint a join token. False is a real answer. */
  ready: boolean
  /** The media plane's address — what a client opens. */
  ws: string
}

/** The org's overlay on the Zero Trust fabric. At most one exists. */
export interface Overlay {
  id: string
  /** The org the overlay belongs to. */
  name: string
  /** How many edge-routers the org has on the fabric. */
  nodes: number
  /** "connected" once at least one of them is online. */
  status: string
  routers: { id: string; name: string; region: string; status: string }[]
}
