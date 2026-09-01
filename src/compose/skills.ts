/**
 * What a turn can actually call.
 *
 * The composer's `/` used to read a hardcoded table of MCP servers — fixed
 * versions, fixed tool counts, and `status: 'connected'` written into the
 * literal — so it offered names nothing could run and reported them as live.
 * This asks the origins instead.
 *
 * `dispatchable` is the field that matters and the SDK says why: it is whether
 * an agent may actually CALL a tool, as against merely see it listed. A menu
 * that offers the rest is a menu that inserts a name and then fails.
 *
 * One read for every origin, like the model catalogue, and for the same reason:
 * an origin that does not answer contributes nothing rather than emptying the
 * list. A machine with no engine is a shorter menu, not a broken one.
 */
import { keys } from '~/data/keys'
import { client, origins } from '~/data/origin'
import { useRead } from '~/data/query'

export interface Skill {
  name: string
  description?: string
  /** Which source it came from, when the origin says. */
  source?: string
}

export const useSkills = () =>
  useRead<Skill[]>(
    keys.skills,
    async () => {
      const listed = await Promise.all(
        origins().map((origin) =>
          client(origin.id)
            .tools.list({ activated: true })
            .catch(() => []),
        ),
      )

      // A name is the thing inserted, so a name is what makes two entries one:
      // the same tool reached through two origins is one choice to a reader.
      const byName = new Map<string, Skill>()
      for (const tool of listed.flat()) {
        if (tool.dispatchable === false) continue
        if (!tool.name || byName.has(tool.name)) continue
        byName.set(tool.name, {
          name: tool.name,
          description: tool.description,
          source: tool.source,
        })
      }
      return [...byName.values()].sort((a, b) => (a.name < b.name ? -1 : 1))
    },
    { fresh: 300_000 },
  )
