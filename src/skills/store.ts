/**
 * The skills this org can reach, and the ones it wrote.
 *
 * Two reads make one list, because the estate keeps them apart on purpose.
 * `/v1/tools/skills` is the registry narrowed to one source: every skill the
 * caller can reach, with the activation flag, and no bodies. `/authored` is the
 * editable half — this org's alone, with the SKILL.md each carries. Neither is
 * a subset the other could be filtered down to, so both are asked.
 *
 * They join by name, across the registry's `skill_` prefix. Getting that
 * backwards would have shown every authored skill twice and matched none of
 * them to its body.
 *
 * The envelope is the trap worth naming: `/v1/tools/skills` answers
 * `{source, tools: […]}`, NOT `{skills: […]}` — it is the tool registry viewed
 * through one source, so it keeps the registry's own envelope. Unwrapping the
 * key the route is named after would read as an empty org and report success.
 *
 * The switch is `useToggleTool`, from `~/tools/store`, because activation is
 * one set the MCP panel changes too. The join is `./fold`, which is pure.
 */

import { atom, useAtom } from '@hanzo/chat/data/store'
import { keys } from '../data/keys.ts'
import { client, ESTATE } from '@hanzo/chat/data/origin'
import { reason, useRead } from '@hanzo/chat/data/query'
import { fromSeconds } from '@hanzo/chat/show'
import { fold, type Listed } from './fold.ts'
import type { Skill } from './types.ts'

export type { Skill }

/** One row of `GET /v1/tools/skills/authored`. */
interface Written {
  name: string
  description?: string
  content?: string
  /** Unix seconds, which is not this app's clock. */
  createdAt?: number
}

/** Whether the panel is showing. This window's, and nobody else's. */
export const open = atom(false)

const read = async (): Promise<Skill[]> => {
  const api = client(ESTATE).http
  // Asked together, and a refusal from either is the answer. An empty list in
  // place of one would draw a tab reporting that the org has nothing.
  const [listed, written] = await Promise.all([
    api.collection<Listed>('tools', { path: '/v1/tools/skills' }),
    api.collection<Written>('skills', { path: '/v1/tools/skills/authored' }),
  ])
  return fold(
    listed,
    written.map((one) => ({ ...one, writtenAt: fromSeconds(one.createdAt) })),
  )
}

export const skillsStore = {
  open: () => open.set(true),
  close: () => open.set(false),
  toggle: () => open.set((showing) => !showing),
}

export const useSkills = () => {
  const isOpen = useAtom(open)
  const listed = useRead(keys.skills, read, { enabled: isOpen, fresh: 60_000 })
  return {
    isOpen,
    skills: listed.data ?? [],
    pending: listed.pending,
    fault: listed.error ? reason(listed.error) : null,
  }
}
