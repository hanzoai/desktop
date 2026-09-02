/**
 * The two skill views, as one list.
 *
 * Its own file because it is the part with a decision in it, and a decision
 * worth proving has to be reachable from a test — which means importing
 * nothing at runtime. `store.ts` does the asking and the clock; this does the
 * joining, and that is all it does.
 *
 * Both halves fail SILENTLY when they are wrong. Getting the `skill_` prefix
 * backwards lists every authored skill twice and matches none of them to its
 * body; dropping a shadowed one hides a thing somebody wrote, with no sign on
 * the screen that anything is missing.
 */
import type { Skill } from './types'

/** One row of the registry view. A skill rides the same shape as every tool. */
export interface Listed {
  name: string
  description?: string
  activated?: boolean
}

/** One authored skill, its clock already in this app's one unit. */
export interface Mine {
  name: string
  description?: string
  content?: string
  writtenAt: number
}

/** Both providers register a skill as `skill_<name>`; the authored view does not. */
const bare = (name: string) => (name.startsWith('skill_') ? name.slice('skill_'.length) : name)

export const fold = (listed: Listed[], authored: Mine[]): Skill[] => {
  const bodies = new Map(authored.map((one) => [one.name, one]))

  const out = listed.map((one) => {
    const name = bare(one.name)
    const mine = bodies.get(name)
    bodies.delete(name)
    return {
      id: one.name,
      name,
      description: one.description || mine?.description,
      activated: one.activated ?? false,
      authored: Boolean(mine),
      content: mine?.content,
      writtenAt: mine?.writtenAt,
    }
  })

  // A skill this org wrote that the registry did not answer with. It exists —
  // the org's own store says so — and a brand skill of the same name SHADOWS
  // it, so dropping it here would hide a thing somebody wrote with no sign of
  // why. It is listed off, because the registry is what activation reads.
  for (const mine of bodies.values())
    out.push({
      id: `skill_${mine.name}`,
      name: mine.name,
      description: mine.description,
      activated: false,
      authored: true,
      content: mine.content,
      writtenAt: mine.writtenAt,
    })

  return out.sort((a, b) => (a.name < b.name ? -1 : 1))
}
