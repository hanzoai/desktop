/**
 * The org's people, and inviting one.
 *
 * This held three literals — "Alex Vance", "Sarah Connor", fixed emails, and a
 * `status` of 'online' or 'idle' written into the source. `inviteMember` never
 * called anything: it appended another literal, marked it online, and returned.
 *
 * **There is no presence.** `GET /v1/presence` is a 404 against a control that
 * also 404s, and the SDK has no presence client. Nobody can say who is looking
 * at a screen right now, so nothing here says it — `status` is gone from the
 * type rather than defaulted to something cheerful.
 *
 * What IS real: `people.list({owner})` is the org's directory, read through
 * IAM's SCIM surface, and `POST /v1/iam/invitations` issues the code a new
 * member redeems. Removing somebody is NOT here — deleting an IAM user is not
 * what a chat header should do, and no other route removes one.
 */
import { useEffect, useState } from 'react'

import { keys } from '~/data/keys'
import { client } from '~/data/origin'
import { useRead, invalidate } from '~/data/query'
import { useSession } from '~/data/session'
import type { Participant } from './types'

/** A stable colour per person. Derived from the id, so it is not a claim. */
const tint = (id: string): string => {
  const hues = ['#34d399', '#60a5fa', '#f472b6', '#a78bfa', '#fbbf24', '#f87171']
  let sum = 0
  for (let i = 0; i < id.length; i += 1) sum = (sum + id.charCodeAt(i)) % 997
  return hues[sum % hues.length]
}

export interface MultiplayerState {
  isInviteOpen: boolean
  participants: Participant[]
  pending: boolean
  fault: string | null
}

/** Only the modal's open state lives here. The people come from the server. */
let open = false
const listeners = new Set<(isOpen: boolean) => void>()
const notify = () => listeners.forEach((fn) => fn(open))

export const multiplayerStore = {
  openInvite: () => {
    open = true
    notify()
  },
  closeInvite: () => {
    open = false
    notify()
  },

  /**
   * Issues an invitation to join the org.
   *
   * The route takes IAM's own row, of which three fields are ours to state: who
   * it is for, which org they are joining, and the name to show. Everything else
   * — the code, the quota, the state — is the server's to mint, so none of it is
   * sent. Failure is raised rather than swallowed: an invitation nobody received
   * must not read as one that was sent.
   */
  invite: async (owner: string, email: string) => {
    await client().http.json({
      method: 'POST',
      path: '/v1/iam/invitations',
      body: { owner, email, displayName: email.split('@')[0] },
    })
    invalidate(keys.people(owner))
  },
}

export const useMultiplayer = (): MultiplayerState => {
  const [isInviteOpen, setOpen] = useState(open)
  useEffect(() => {
    const handler = (next: boolean) => setOpen(next)
    listeners.add(handler)
    return () => {
      listeners.delete(handler)
    }
  }, [])

  const { user } = useSession()
  // The session carries the org on `role` — IAM's `owner`, which is what SCIM
  // filters a directory by.
  const owner = user?.role ?? ''

  const directory = useRead<Participant[]>(
    keys.people(owner),
    async () => {
      const people = await client().people.list({ owner, service: false })
      return people.map((person) => ({
        id: person.id,
        name: person.displayName || person.name,
        email: person.email ?? '',
        role: person.admin ? ('admin' as const) : ('editor' as const),
        color: tint(person.id),
      }))
    },
    { enabled: Boolean(owner), fresh: 300_000 },
  )

  return {
    isInviteOpen,
    participants: directory.data ?? [],
    pending: directory.pending,
    fault: directory.error ? String(directory.error) : null,
  }
}
