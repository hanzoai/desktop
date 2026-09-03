/**
 * The org's agents, from `/v1/agents` through the SDK's own client.
 *
 * One read, one key, one cache entry, and every surface that names an agent
 * reads it here rather than keeping a second roster.
 */
import { keys } from '../data/keys'
import { client, ESTATE } from '@hanzo/chat/data/origin'
import { invalidate, useRead, useSend } from '@hanzo/chat/data/query'
import type { AgentDefinition } from './types'

export type { AgentDefinition }

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

/** The roster changed elsewhere — a new agent was defined. */
export const refresh = () => invalidate(keys.agents)

/**
 * Runs an agent on `input`, and answers when the run is recorded.
 *
 * `ref` is the agent's name or id. A REFUSED RUN ANSWERS 200 carrying its own
 * error, so the recorded status is the verdict — reading the body as success
 * would report work that the estate says did not happen. The roster goes stale
 * because a run is counted on the agent's own row.
 */
export const useRunAgent = () =>
  useSend(async (ref: string, input: string) => {
    const done = await client(ESTATE).agents.run(ref, input)
    if (done.status === 'error') throw new Error(done.error || 'the run failed')
  }, [keys.agents])
