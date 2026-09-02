/**
 * The org's agents, and which of them this desktop is composing with.
 *
 * The roster is read from `/v1/agents` through the SDK's own client. What stays
 * local is the SELECTION — which agents the composer addresses — because that
 * is a fact about this window and nothing on the server records it.
 *
 * Swarm mode used to activate four agents BY ID: 'planner', 'dev', 'secops',
 * 'executor'. Those ids were this file's own literals, so on a real org it
 * selected nothing at all. It now takes the first few agents the org actually
 * has, and selects nothing when it has none.
 */
import { useEffect, useState } from 'react'

import { client, ESTATE } from '~/data/origin'
import type { AgentDefinition } from './types'

export type { AgentDefinition }

/** How many agents swarm mode addresses at once. */
const swarmWidth = 4

export interface SwarmState {
  agents: AgentDefinition[]
  activeAgentIds: string[]
  swarmMode: boolean
  isExecuting: boolean
  activePhase: string | null
  pending: boolean
  fault: string | null
}

let state: SwarmState = {
  agents: [],
  activeAgentIds: [],
  swarmMode: false,
  isExecuting: false,
  activePhase: null,
  pending: false,
  fault: null,
}

const listeners = new Set<(s: SwarmState) => void>()

const put = (next: Partial<SwarmState>) => {
  state = { ...state, ...next }
  listeners.forEach((fn) => fn(state))
}

const because = (e: unknown): string =>
  e instanceof Error ? e.message : typeof e === 'string' ? e : 'the call failed'

const read = async () => {
  put({ pending: true, fault: null })
  try {
    const listed = await client(ESTATE).agents.list()
    const seen: AgentDefinition[] = listed.map((one) => ({
      id: one.id,
      name: one.name,
      description: one.description ?? '',
      model: one.model,
      tools: one.tools ?? [],
      executionMode: one.executionMode ?? '',
      schedule: one.schedule ?? '',
      status: one.status ?? '',
      runs: one.runs ?? 0,
      avatar: one.avatar ?? '',
      emoji: one.emoji ?? '',
      updatedAt: one.updatedAt ?? '',
    }))
    // Keep a selection only where it still names an agent that exists.
    const held = state.activeAgentIds.filter((id) => seen.some((one) => one.id === id))
    put({
      agents: seen,
      activeAgentIds: held.length > 0 ? held : seen[0] ? [seen[0].id] : [],
      pending: false,
    })
  } catch (e) {
    put({ pending: false, fault: because(e) })
  }
}

export const swarmStore = {
  get: (): SwarmState => state,
  refresh: () => void read(),

  toggleAgent: (id: string) => {
    const held = state.activeAgentIds
    if (!held.includes(id)) {
      put({ activeAgentIds: [...held, id] })
      return
    }
    // The composer addresses at least one agent, so the last one does not leave.
    if (held.length > 1) put({ activeAgentIds: held.filter((one) => one !== id) })
  },

  setSwarmMode: (swarmMode: boolean) => {
    const roster = state.agents
    put({
      swarmMode,
      activeAgentIds: swarmMode
        ? roster.slice(0, swarmWidth).map((one) => one.id)
        : roster[0]
          ? [roster[0].id]
          : [],
    })
  },

  getActiveAgents: (): AgentDefinition[] =>
    state.agents.filter((one) => state.activeAgentIds.includes(one.id)),

  setExecutingPhase: (phase: string | null) =>
    put({ isExecuting: phase !== null, activePhase: phase }),
}

export const useSwarm = (): SwarmState => {
  const [current, setCurrent] = useState<SwarmState>(state)
  useEffect(() => {
    const handler = (next: SwarmState) => setCurrent(next)
    listeners.add(handler)
    // The bar mounts once, so the first mount is the read. Nothing polls.
    if (!state.pending && state.agents.length === 0 && !state.fault) void read()
    return () => {
      listeners.delete(handler)
    }
  }, [])
  return current
}
