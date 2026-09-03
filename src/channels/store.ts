/**
 * The rooms this org has, from the estate's own team surface.
 *
 * `GET /v1/team/rooms` is where rooms live, and a room carries `name`, `topic`,
 * `private`, `direct`, `members`, `workspace` and `archived`. There is no `team`
 * resource on the SDK client, so this goes through `client.http`, which the SDK
 * exposes for exactly this; `collection('rooms')` unwraps the `{rooms: […]}`
 * envelope the route answers with.
 *
 * TWO THINGS THE SERVER DOES NOT DO, and neither is invented here:
 *
 *   Cross-org. The route's own summary is "every room of the CALLER'S org",
 *   so there is no browsing another org and no joining one. Public channels
 *   across orgs are HIP-1327, whose directory half is shipped and whose join
 *   half is blocked on what a tenant boundary means.
 *
 *   Unread. Nothing on the wire says what has been read, so no count is shown.
 *   A zero would be a claim, and an invented number is what was here before.
 */
import { atom, useAtom } from '@hanzo/chat/data/store'
import { keys } from '~/data/keys'
import { client, ESTATE } from '@hanzo/chat/data/origin'
import { reason, useRead, useSend } from '@hanzo/chat/data/query'
import type { ChatRoom, RoomType } from './types'

export type { ChatRoom, RoomType }

/** One room as `/v1/team/rooms` answers it. */
interface TeamRoom {
  id: string
  name?: string
  topic?: string
  workspace?: string
  /** A direct message rather than a named room. */
  direct?: boolean
  /** Visible to the org, or only to its members. */
  private?: boolean
  archived?: boolean
  members?: string[]
}

/** Which room is on screen, and whether the create sheet is showing. */
export const active = atom('')
export const creating = atom(false)

const read = async (): Promise<ChatRoom[]> => {
  const listed = await client(ESTATE).http.collection<TeamRoom>('rooms', {
    path: '/v1/team/rooms',
  })
  // An archived room is not a room somebody is in; it is kept so history
  // survives. Listing it in the rail would make every closed thread permanent.
  return listed
    .filter((room) => !room.archived)
    .map((room) => ({
      id: room.id,
      type: room.direct ? ('dm' as RoomType) : ('channel' as RoomType),
      name: room.name ?? room.id,
      topic: room.topic,
      members: room.members ?? [],
      isPrivate: room.private,
    }))
}

export const channelsStore = {
  setActiveRoom: (id: string) => active.set(id),
  openCreate: () => creating.set(true),
  closeCreate: () => creating.set(false),
}

export const useChannels = () => {
  const listed = useRead(keys.rooms, read)
  const rooms = listed.data ?? []
  const chosen = useAtom(active)

  return {
    rooms,
    // The rail must land somewhere, and the first room is where — but only as a
    // FALLBACK, so a choice already made is never overridden by a re-read.
    activeRoomId: chosen && rooms.some((one) => one.id === chosen) ? chosen : (rooms[0]?.id ?? ''),
    isCreateOpen: useAtom(creating),
    pending: listed.pending,
    fault: listed.error ? reason(listed.error) : null,
  }
}

/**
 * Opens a room.
 *
 * A name is the whole required request — the server defaults the rest, and
 * public is its default because a room nobody can find is the more surprising
 * of the two. `space` is deliberately not sent: an org with one has no choice
 * to make, and an org with several must be asked rather than guessed for.
 */
export const useOpenRoom = () =>
  useSend(
    async (name: string, topic?: string, isPrivate?: boolean) => {
      await client(ESTATE).http.json({
        method: 'POST',
        path: '/v1/team/rooms',
        body: { name, topic: topic || undefined, private: isPrivate || undefined },
      })
      creating.set(false)
    },
    [keys.rooms],
  )
