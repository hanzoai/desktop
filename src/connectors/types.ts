/**
 * A provider this org can connect, and the two facts that are not one fact.
 *
 * `GET /v1/integrations` answers the whole catalogue with this org's standing
 * against each. There is no `/v1/connectors`: the word names the product and
 * `integrations` names the route, and the estate keeps a SECOND, user-scoped
 * plane at `/v1/integrations/connectors` which is a person's own credentials
 * rather than the org's. This is the org's.
 *
 * **`available` and `connected` are independent and mean different things.**
 * Available is whether THIS DEPLOYMENT holds the provider's app credentials —
 * so `connect` can succeed at all. Connected is whether this org has a live
 * connection. A card that folded them into one status would offer Connect on a
 * provider the fleet cannot connect, and that button answers 503.
 *
 * A connection carries the account it was made against and never a token: the
 * credential lives in KMS and no route echoes it.
 */
export interface Provider {
  /** The registry id, and the path segment every write addresses. */
  id: string
  name: string
  description?: string
  /** How the catalogue groups it — "Communication", "Developer", "Marketing". */
  category?: string
  /** This deployment holds the app credentials, so connecting can work. */
  available: boolean
  /** This org has a live connection. */
  connected: boolean
  /** The provider's label for the connected account. Connected only. */
  account?: string
  /** What the credential is allowed to do. Empty when the provider said none. */
  scopes: string[]
  /** When the connection was last established, unix milliseconds. */
  connectedAt?: number
}
