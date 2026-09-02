/**
 * The providers this org can connect, and its standing against each.
 *
 * One read — `GET /v1/integrations`, which answers the whole catalogue with
 * this org's connection folded in, so there is no second request per card and
 * no list that can disagree with itself.
 *
 * Two writes, and the asymmetry between them is the estate's rather than this
 * client's. Disconnect finishes here: it revokes, forgets the credential and
 * answers, and it is idempotent. Connect does NOT — it mints a consent URL and
 * the trip that follows lands on the CONSOLE, because that is where the
 * provider's callback redirects. So connect hands the browser a URL and this
 * panel stops; what it can honestly claim is that somebody was sent, not that
 * anything was connected.
 *
 * The body carries no `token` key ON PURPOSE. The route picks its credential
 * path by the PRESENCE of that key: absent starts the three-legged OAuth flow,
 * present seals a customer's own API token. This app never asks for a token —
 * a credential prompt inside an app's own window is the thing sign-in already
 * refuses to be — so a provider that has only the token path answers 400 saying
 * a token is required, and that sentence is what the card shows.
 */
import { keys } from '~/data/keys'
import { client, ESTATE } from '~/data/origin'
import { reason, useRead, useSend } from '~/data/query'
import { visit } from '~/data/shell'
import { atom, useAtom } from '~/data/store'
import { fromStamp } from '~/show'
import type { Provider } from './types'

export type { Provider }

/** One row of `GET /v1/integrations`. */
interface Card {
  id: string
  name?: string
  description?: string
  category?: string
  available?: boolean
  connected?: boolean
  connection?: {
    account?: string
    scopes?: string[]
    /** RFC 3339, which is not this app's clock. */
    connectedAt?: string
  }
}

/** Whether the panel is showing. This window's, and nobody else's. */
export const open = atom(false)

const read = async (): Promise<Provider[]> => {
  const rows = await client(ESTATE).http.collection<Card>('providers', {
    path: '/v1/integrations',
  })
  return rows.map((one) => ({
    id: one.id,
    name: one.name ?? one.id,
    description: one.description,
    category: one.category,
    available: one.available ?? false,
    connected: one.connected ?? false,
    account: one.connection?.account,
    scopes: one.connection?.scopes ?? [],
    connectedAt: fromStamp(one.connection?.connectedAt),
  }))
}

export const connectorsStore = {
  open: () => open.set(true),
  close: () => open.set(false),
  toggle: () => open.set((showing) => !showing),
}

export const useConnectors = () => {
  const isOpen = useAtom(open)
  const listed = useRead(keys.connectors, read, { enabled: isOpen, fresh: 60_000 })
  return {
    isOpen,
    providers: listed.data ?? [],
    pending: listed.pending,
    fault: listed.error ? reason(listed.error) : null,
  }
}

/**
 * Begin a connection, and hand the browser the consent URL the estate minted.
 *
 * It names no stale key. Nothing has changed yet — the org connects when the
 * provider calls the estate back, which happens after this window is done
 * caring — so claiming the catalogue is stale here would re-read it to get the
 * same answer and make the card flicker as if something had happened.
 */
export const useConnect = () =>
  useSend(async (id: string) => {
    const { authorizeUrl } = await client(ESTATE).http.json<{ authorizeUrl?: string }>({
      method: 'POST',
      path: `/v1/integrations/${encodeURIComponent(id)}/connect`,
      body: {},
    })
    // The consent trip is the URL, so an answer without one starts nothing.
    // Why it is missing is the estate's to say, and it did not say.
    if (!authorizeUrl) throw new Error('the answer carried no authorize URL')
    visit(authorizeUrl)
  })

/** Forget a connection. Idempotent on the estate, so it never needs a guard. */
export const useDisconnect = () =>
  useSend(
    (id: string) =>
      client(ESTATE).http.json({
        method: 'POST',
        path: `/v1/integrations/${encodeURIComponent(id)}/disconnect`,
        body: {},
      }),
    [keys.connectors],
  )
