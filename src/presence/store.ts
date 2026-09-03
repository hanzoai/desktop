/**
 * The org's people, and inviting one.
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
import { atom, useAtom } from '@hanzo/chat/data/store'
import { keys } from '~/data/keys'
import { client } from '@hanzo/chat/data/origin'
import { reason, useRead, useSend } from '@hanzo/chat/data/query'
import { useSession } from '@hanzo/chat/data/session'
import { tint } from '@hanzo/chat/show'
import type { Participant } from './types'

/** Whether the invite sheet is showing. */
export const inviting = atom(false)

export const multiplayerStore = {
  openInvite: () => inviting.set(true),
  closeInvite: () => inviting.set(false),
}

/** The org the session acts in — IAM's `owner`, which SCIM filters by. */
const useOwner = (): string => useSession().user?.role ?? ''

export const useMultiplayer = () => {
  const owner = useOwner()
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
    isInviteOpen: useAtom(inviting),
    participants: directory.data ?? [],
    pending: directory.pending,
    fault: directory.error ? reason(directory.error) : null,
  }
}

/**
 * Issues an invitation to join the org.
 *
 * The route takes IAM's own row, of which three fields are ours to state: who
 * it is for, which org they are joining, and the name to show. Everything else
 * — the code, the quota, the state — is the server's to mint, so none of it is
 * sent.
 */
export const useInvite = () => {
  const owner = useOwner()
  return useSend(
    async (email: string) => {
      await client().http.json({
        method: 'POST',
        path: '/v1/iam/invitations',
        body: { owner, email, displayName: email.split('@')[0] },
      })
    },
    [keys.people(owner)],
  )
}
