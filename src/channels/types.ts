/**
 * Unified Room Types: Channels, DMs, and Informal Groups.
 */
export type RoomType = 'channel' | 'dm' | 'group'

export interface ChatRoom {
  id: string
  type: RoomType
  name?: string
  topic?: string
  members: string[] // User IDs and Agent IDs
  isPrivate?: boolean
  unreadCount?: number
  lastMessage?: string
  lastActivity?: string
  avatar?: string
}
