/**
 * Unified Room Store for Channels, DMs, and Informal Groups.
 */
import { useEffect, useState } from 'react'
import type { ChatRoom, RoomType } from './types'

export type { ChatRoom, RoomType }

const DEFAULT_ROOMS: ChatRoom[] = [
  // Channels
  {
    id: 'chan-general',
    type: 'channel',
    name: 'general',
    topic: 'Company-wide updates and AI co-piloting',
    members: ['user_self', 'user_alex', 'user_sarah', 'agent_dev'],
    unreadCount: 0,
    lastActivity: '1m ago',
  },
  {
    id: 'chan-dev-swarm',
    type: 'channel',
    name: 'dev-swarm',
    topic: 'Full-stack Next.js 16, React 19, and ZAP microservices',
    members: ['user_self', 'agent_planner', 'agent_dev', 'agent_secops'],
    unreadCount: 2,
    lastActivity: 'Just now',
  },
  {
    id: 'chan-cloud-ops',
    type: 'channel',
    name: 'cloud-ops',
    topic: 'Local k3s cluster, MicroVM enclaves, and CI/CD pipelines',
    members: ['user_self', 'agent_executor'],
    unreadCount: 0,
    lastActivity: '15m ago',
  },

  // Direct Messages (People & Agents)
  {
    id: 'dm-alex',
    type: 'dm',
    name: 'Alex Vance',
    members: ['user_self', 'user_alex'],
    unreadCount: 0,
    lastMessage: 'Let us run the benchmark tests on the ZAP stream.',
    lastActivity: '5m ago',
    avatar: 'https://cdn.hanzo.ai/avatars/alex.png',
  },
  {
    id: 'dm-dev-agent',
    type: 'dm',
    name: '@dev (SWE Agent)',
    members: ['user_self', 'agent_dev'],
    unreadCount: 1,
    lastMessage: 'Ready to synthesize the Next.js 16 components.',
    lastActivity: '2m ago',
    avatar: 'https://cdn.hanzo.ai/avatars/dev.png',
  },
  {
    id: 'dm-planner',
    type: 'dm',
    name: '@planner (Architect)',
    members: ['user_self', 'agent_planner'],
    unreadCount: 0,
    lastMessage: 'Architecture DAG phases validated.',
    lastActivity: '20m ago',
    avatar: 'https://cdn.hanzo.ai/avatars/planner.png',
  },

  // Informal Groups (No formal name required — derived from participant set)
  {
    id: 'group-alex-dev',
    type: 'group',
    members: ['user_self', 'user_alex', 'agent_dev'],
    unreadCount: 0,
    lastMessage: 'Multi-agent review session in progress.',
    lastActivity: '10m ago',
  },
]

export interface ChannelsState {
  rooms: ChatRoom[]
  activeRoomId: string
  isCreateOpen: boolean
  createType: RoomType
}

let state: ChannelsState = {
  rooms: DEFAULT_ROOMS,
  activeRoomId: 'chan-general',
  isCreateOpen: false,
  createType: 'channel',
}

const listeners = new Set<(s: ChannelsState) => void>()

const notify = () => {
  listeners.forEach((fn) => fn(state))
}

export const channelsStore = {
  get: (): ChannelsState => state,

  setActiveRoom: (id: string) => {
    state = {
      ...state,
      activeRoomId: id,
      rooms: state.rooms.map((r) => (r.id === id ? { ...r, unreadCount: 0 } : r)),
    }
    notify()
  },

  openCreate: (type: RoomType = 'channel') => {
    state = { ...state, isCreateOpen: true, createType: type }
    notify()
  },

  closeCreate: () => {
    state = { ...state, isCreateOpen: false }
    notify()
  },

  createRoom: (type: RoomType, members: string[], name?: string, topic?: string, isPrivate = false) => {
    const id = type === 'channel'
      ? `chan-${name?.toLowerCase().replace(/[^a-z0-9_-]/g, '-') || Date.now()}`
      : type === 'dm'
      ? `dm-${members.find((m) => m !== 'user_self') || Date.now()}`
      : `group-${Date.now()}`

    const newRoom: ChatRoom = {
      id,
      type,
      name,
      topic,
      members,
      isPrivate,
      unreadCount: 0,
      lastActivity: 'Just now',
    }

    state = {
      ...state,
      rooms: [newRoom, ...state.rooms],
      activeRoomId: newRoom.id,
      isCreateOpen: false,
    }
    notify()
  },
}

export const useChannels = (): ChannelsState => {
  const [current, setCurrent] = useState<ChannelsState>(state)

  useEffect(() => {
    const handler = (next: ChannelsState) => setCurrent(next)
    listeners.add(handler)
    return () => {
      listeners.delete(handler)
    }
  }, [])

  return current
}
