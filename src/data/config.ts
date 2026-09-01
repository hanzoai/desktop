/**
 * What may be asked, and of whom.
 *
 * One read per origin backs the whole menu. `/v1/models` lists every model that
 * origin serves, each carrying `owned_by`, and that field IS the publisher — so
 * the menu's grouping is derived from the catalogue rather than read from a
 * second route that could disagree with it.
 *
 * An origin that does not answer contributes nothing and refuses nothing: the
 * engine is not always running, and a machine with no engine is a shorter menu,
 * not a broken screen.
 *
 * The deployment-config read is gone. `/v1/chat/config` answered this client's
 * name, its limits, its guest policy and its MCP servers, and it does not exist:
 * every one of those was a fallback in practice. The name is the brand's and
 * always was; what a guest may do is decided server-side from the absence of a
 * bearer, which is where it belongs and where it was already decided.
 */
import { keys } from '~/data/keys'
import { client, origins } from '~/data/origin'
import { useRead } from '~/data/query'
import type { Served } from '~/data/types'

/** Who publishes a model, when it says. The menu's fallback group. */
const OTHER = 'other'

/**
 * Every model this build can reach, by origin then publisher.
 *
 * Held for the visit: a catalogue changes when an estate is redeployed or an
 * engine loads a model, not while somebody is choosing from it.
 *
 * Signed-in only, and not by choice: the estate's client resolves a token
 * before every request and THROWS `AuthError` when the browser holds no
 * session, so an unguarded read by a guest fails before it reaches the network.
 * See the `anonymous` entry in `~/data/missing`.
 */
export const useModels = (enabled = true) =>
  useRead<Served>(
    keys.models,
    async () => {
      const here = origins()
      const listed = await Promise.all(
        here.map((origin) =>
          client(origin.id)
            .models.list()
            .catch(() => []),
        ),
      )
      const served: Served = {}
      here.forEach((origin, at) => {
        const by: Record<string, string[]> = {}
        for (const model of listed[at]) {
          const owner =
            typeof model.owned_by === 'string' && model.owned_by ? model.owned_by : OTHER
          ;(by[owner] ??= []).push(model.id)
        }
        if (Object.keys(by).length > 0) served[origin.id] = by
      })
      return served
    },
    { enabled, fresh: 300_000 },
  )
