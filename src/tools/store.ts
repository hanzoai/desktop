/**
 * The tool registry, from this app: what may be called, and what is switched on.
 *
 * Both halves are here because there is ONE activation set on the estate and
 * three panels change it — the MCP servers, the skills, and whatever comes
 * next. A writer per panel is three statements of one fact, and the SDK makes
 * that expensive to get wrong: `activate` takes the WHOLE set, so a panel
 * sending only the name somebody clicked switches off everything else.
 *
 * ## What may be called
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
 * **This is not the skills menu, and it was called one.** A skill is discovery
 * metadata attached to an agent, and the estate registers every one of them
 * `dispatchable: false` — so the filter below excluded, by construction, the
 * entire category this file was named after. Skills live in `~/skills`, where
 * activating one changes what an agent KNOWS; here a name is inserted into a
 * draft to be CALLED, and the two are not the same act.
 *
 * One read for every origin, like the model catalogue, and for the same reason:
 * an origin that does not answer contributes nothing rather than emptying the
 * list. A machine with no engine is a shorter menu, not a broken one.
 */
import { keys } from '~/data/keys'
import { client, ESTATE, origins } from '@hanzo/chat/data/origin'
import { useRead, useSend } from '@hanzo/chat/data/query'

export interface Tool {
  name: string
  description?: string
  /** Which source it came from, when the origin says. */
  source?: string
}

export const useTools = () =>
  useRead<Tool[]>(
    keys.tools,
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
      const byName = new Map<string, Tool>()
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

/**
 * Switches one tool on or off. THE one writer of the activation set.
 *
 * Reads the LIVE set rather than trusting the view that called it: another
 * surface may have changed it since, and the whole set is what gets sent.
 *
 * The stale list names every view of that set, not the panel that clicked.
 * Activation is one value, so a skill switched on in one panel makes the MCP
 * tool rows and the composer's menu stale in the same instant — and a panel
 * naming only itself is how two views of one set come to disagree on screen.
 */
export const useToggleTool = () =>
  useSend(async (name: string) => {
    const ai = client(ESTATE)
    const active = await ai.tools.activation()
    const on = new Set(active?.enabled ?? [])
    if (on.has(name)) on.delete(name)
    else on.add(name)
    await ai.tools.activate([...on])
  }, [keys.servers, keys.tools, keys.skills])
