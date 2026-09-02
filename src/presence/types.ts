/**
 * The org's people, as a rail and an invite dialog need them.
 *
 * There is no `status`. Presence — who is looking at a screen right now — has no
 * route (`/v1/presence` is a 404 against a control that also 404s) and no client
 * on the SDK, so the field it was declared with could only ever have been made
 * up, and was.
 */
export type MemberRole = 'admin' | 'editor' | 'viewer'

export interface Participant {
  id: string
  name: string
  email: string
  avatar?: string
  role: MemberRole
  color: string
}

export interface RoomInvite {
  code: string
  url: string
  expiresAt: string
}
