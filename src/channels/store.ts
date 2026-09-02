/**
 * The rooms this org has, from the estate's own team surface.
 *
 * The rooms here were nine literals — `#general`, `#dev-swarm`, DMs with agents,
 * each with an invented last message, an invented unread count and a "Just now"
 * that was a string. None of it came from anywhere.
 *
 * `GET /v1/team/rooms` is where rooms actually live, and a room carries
 * `name`, `topic`, `private`, `direct`, `members`, `workspace` and `archived`.
 * There is no `team` resource on the SDK client, so this goes through
 * `client.http`, which the SDK exposes for exactly this; `collection('rooms')`
 * unwraps the `{rooms: […]}` envelope the route answers with.
 *
 * TWO THINGS THE SERVER DOES NOT DO, and neither is invented here:
 *
 *   Cross-org. The route's own summary is "every room of the CALLER'S org",
 *   so there is no browsing another org and no joining one. Public channels
 *   across orgs need a route that lists them and a route that joins one —
 *   see `docs` in this repo's CLAUDE.md rather than a client that pretends.
 *
 *   Unread. Nothing on the wire says what has been read, so no count is shown.
 *   A zero would be a claim, and an invented number is what was here before.
 */
import { useEffect, useState } from 'react'

import { client, ESTATE } from '~/data/origin'
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

export interface ChannelsState {
  rooms: ChatRoom[]
  activeRoomId: string
  pending: boolean
  fault: string | null
  isCreateOpen: boolean
}

let state: ChannelsState = {
  rooms: [],
  activeRoomId: '',
  pending: false,
  fault: null,
  isCreateOpen: false,
}

const listeners = new Set<(s: ChannelsState) => void>()

const put = (next: Partial<ChannelsState>) => {
  state = { ...state, ...next }
  listeners.forEach((fn) => fn(state))
}

const because = (e: unknown): string =>
  e instanceof Error ? e.message : typeof e === 'string' ? e : 'the call failed'

const read = async () => {
  put({ pending: true, fault: null })
  try {
    const listed = await client(ESTATE).http.collection<TeamRoom>('rooms', {
      path: '/v1/team/rooms',
    })

    // An archived room is not a room somebody is in; it is kept so history
    // survives. Listing it in the rail would make every closed thread permanent.
    const seen: ChatRoom[] = listed
      .filter((room) => !room.archived)
      .map((room) => ({
        id: room.id,
        type: room.direct ? ('dm' as RoomType) : ('channel' as RoomType),
        name: room.name ?? room.id,
        topic: room.topic,
        members: room.members ?? [],
        isPrivate: room.private,
      }))

    put({ rooms: seen, pending: false, activeRoomId: state.activeRoomId || seen[0]?.id || '' })
  } catch (e) {
    put({ pending: false, fault: because(e) })
  }
}

export const channelsStore = {
  get: (): ChannelsState => state,
  refresh: () => void read(),
  setActiveRoom: (activeRoomId: string) => put({ activeRoomId }),

  openCreate: () => put({ isCreateOpen: true, fault: null }),
  closeCreate: () => put({ isCreateOpen: false }),

  /**
   * Opens a room.
   *
   * A name is the whole required request — the server defaults the rest, and
   * public is its default because a room nobody can find is the more surprising
   * of the two. `space` is deliberately not sent: an org with one has no choice
   * to make, and an org with several must be asked rather than guessed for.
   *
   * The refusal is raised, not swallowed. A room that was never opened must not
   * read as one that was.
   */
  create: async (name: string, topic?: string, isPrivate?: boolean) => {
    await client(ESTATE).http.json({
      method: 'POST',
      path: '/v1/team/rooms',
      body: { name, topic: topic || undefined, private: isPrivate || undefined },
    })
    put({ isCreateOpen: false })
    await read()
  },
}

export const useChannels = (): ChannelsState => {
  const [current, setCurrent] = useState<ChannelsState>(state)
  useEffect(() => {
    const handler = (next: ChannelsState) => setCurrent(next)
    listeners.add(handler)
    // The rail mounts once, so the first mount is the read. Nothing polls.
    if (!state.pending && state.rooms.length === 0 && !state.fault) void read()
    return () => {
      listeners.delete(handler)
    }
  }, [])
  return current
}
