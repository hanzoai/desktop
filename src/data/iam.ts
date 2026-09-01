/**
 * The one IAM client.
 *
 * It lives apart from `session.tsx` because two things need it and neither may
 * build its own: the session drives the sign-in, and `ai.ts` hands it to the SDK
 * as the token source. A second instance would hold a second PKCE verifier in a
 * second storage slot, and whichever one did not start the round trip would fail
 * to finish it.
 *
 * Built on first use rather than at import, because it reads `window`.
 */
import { IAM } from '@hanzo/iam'

import { brand, clientId } from '~/brand'
import { callbackPath, loginPath } from '~/data/api'

/**
 * What a session asks for.
 *
 * `offline_access` is what makes a session outlive its access token. IAM issues
 * a refresh token only when asked, and without one the only way past an expiry
 * is a full redirect to the issuer — a page navigation in the middle of whatever
 * someone was typing.
 */
const scope = 'openid profile email offline_access'

let engine: IAM | null = null

export const iam = (): IAM => {
  if (engine) return engine

  const isLocal =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')

  // On localhost, hanzo.id allowlists hanzo-app / hanzo-ai on http://localhost:3000/auth/callback.
  // In production, each brand's domain (hanzo.chat, lux.chat, etc.) is allowlisted under `<org>-chat`.
  const effectiveClientId = isLocal ? 'hanzo-app' : clientId
  const redirectUri = isLocal
    ? `http://localhost:3000${callbackPath}`
    : `${window.location.origin}${callbackPath}`
  const postLogoutRedirectUri = isLocal
    ? `http://localhost:3000${loginPath}?redirect=false`
    : `${window.location.origin}${loginPath}?redirect=false`

  engine = new IAM({
    serverUrl: brand.issuer,
    clientId: effectiveClientId,
    organization: brand.org,
    redirectUri,
    postLogoutRedirectUri,
    scope,
  })

  return engine
}
