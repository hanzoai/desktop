/**
 * The org's agents, and which of them this desktop is composing with.
 *
 * The roster is `/v1/agents` through the SDK's own client. What stays local is
 * the SELECTION — which agents the composer addresses — because that is a fact
 * about this window and nothing on the server records it. Two questions, two
 * primitives.
 *
 * Swarm mode used to activate four agents BY ID: 'planner', 'dev', 'secops',
 * 'executor'. Those ids were this file's own literals, so on a real org it
 * selected nothing. It takes the first few agents the org actually has.
 */
import { atom, useAtom } from '~/data/store'
import { keys } from '~/data/keys'
import { client, ESTATE } from '~/data/origin'
import { invalidate, peek, reason, useRead } from '~/data/query'
import type { AgentDefinition } from './types'

export type { AgentDefinition }

/** How many agents swarm mode addresses at once. */
const swarmWidth = 4

/** The composer's selection, and whether it is fanning out. */
export const chosen = atom<string[]>([])
export const swarm = atom(false)
export const phase = atom<string | null>(null)

const read = async (): Promise<AgentDefinition[]> => {
  const listed = await client(ESTATE).agents.list()
  return listed.map((one) => ({
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
}

/** The roster, wherever it is needed. One read, one key, one cache entry. */
export const useAgents = () => useRead(keys.agents, read, { fresh: 60_000 })

export const swarmStore = {
  toggleAgent: (id: string) =>
    chosen.set((held) => {
      if (!held.includes(id)) return [...held, id]
      // The composer addresses at least one agent, so the last one does not go.
      return held.length > 1 ? held.filter((one) => one !== id) : held
    }),

  /**
   * Fans out, or stops.
   *
   * The roster is READ FROM THE CACHE rather than passed in, because a caller
   * is often a keyboard shortcut with no component around it. `peek` never
   * triggers a read, so a shortcut pressed before the roster has arrived
   * selects nothing rather than waiting or guessing at ids.
   */
  setSwarmMode: (on: boolean) => {
    const roster = peek<AgentDefinition[]>(keys.agents) ?? []
    swarm.set(on)
    chosen.set(
      on ? roster.slice(0, swarmWidth).map((one) => one.id) : roster[0] ? [roster[0].id] : [],
    )
  },

  /** Whether it is fanning out, for a caller with no component around it. */
  isSwarming: (): boolean => swarm.get(),

  setExecutingPhase: (next: string | null) => phase.set(next),

  /** The roster changed elsewhere — a new agent was defined. */
  refresh: () => invalidate(keys.agents),
}

export const useSwarm = () => {
  const roster = useAgents()
  const agents = roster.data ?? []
  const held = useAtom(chosen)
  const running = useAtom(phase)

  // A selection only ever names an agent that exists: a roster that changed
  // under a held id must not leave the composer addressing nobody.
  const live = held.filter((id) => agents.some((one) => one.id === id))

  return {
    agents,
    activeAgentIds: live.length > 0 ? live : agents[0] ? [agents[0].id] : [],
    swarmMode: useAtom(swarm),
    isExecuting: running !== null,
    activePhase: running,
    pending: roster.pending,
    fault: roster.error ? reason(roster.error) : null,
  }
}
