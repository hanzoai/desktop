/**
 * The one IAM client.
 *
 * It lives apart from `session.tsx` because two things need it and neither may
 * build its own: the session drives the sign-in, and `origin.ts` hands it to
 * the SDK as the token source. A second instance would hold a second PKCE
 * verifier in a second storage slot, and whichever one did not start the round
 * trip would fail to finish it.
 *
 * Built on first use rather than at import, because it reads `window`.
 */
import { IAM } from '@hanzo/iam'

import { brand, clientId } from '@hanzo/chat/brand'
import { callbackPath, loginPath } from './api.ts'
import { shell } from '@hanzo/chat/data/shell'
import { vault } from '@hanzo/chat/data/vault'

/**
 * What a session asks for.
 *
 * `offline_access` is what makes a session outlive its access token. IAM issues
 * a refresh token only when asked, and without one the only way past an expiry
 * is a full redirect to the issuer — a page navigation in the middle of whatever
 * someone was typing.
 */
const scope = 'openid profile email offline_access'

/**
 * Which IAM answers.
 *
 * The brand's, unless a deployment names another — `hanzo up` stands the whole
 * estate up on this machine, and pointing at it is then one variable rather
 * than a second build. `VITE_HANZO_API` says where the API is; this says where
 * identity is, and they move together.
 */
const issuer = (import.meta.env.VITE_HANZO_IAM as string) || brand.issuer

let engine: IAM | null = null

export const iam = (): IAM => {
  if (engine) return engine

  // Where the browser already is. A redirect URI is a round trip back to THIS
  // document, so the origin serving it is the only correct answer — a literal
  // is right for one port and silently wrong for every other, which is what
  // sent a dev server on 5173 back to a page on 3000 that was not running.
  // What an issuer must then do is register the loopback origins it will serve.
  const here = window.location.origin

  engine = new IAM({
    serverUrl: issuer,
    clientId,
    organization: brand.org,
    ...back(here),
    // The machine's credential store where there is one, and the SDK's own
    // default — the browser's — where there is not.
    storage: vault(),
    scope,
  })

  return engine
}

/**
 * Where the issuer returns this app, and where it returns it after a sign-out.
 *
 * The two are one decision, so they are made in one place. On the web both are
 * this document. The desktop has NO address a document could answer on — its
 * pages are served from `tauri://localhost`, which no issuer can reach — so the
 * trip goes out to the browser and comes back through the scheme the operating
 * system routes to this app. The brand rides the path, one scheme for all of
 * them, which is what `src-tauri/tauri.conf.json` registers.
 *
 * Nothing here can MAKE either address work: the issuer redirects only where
 * the application has registered, which is a registration held in one place
 * rather than a literal compiled into the client.
 *
 * The desktop asks for no return trip after signing out. The browser that ends
 * the session is not the app, so there is nowhere for it to come back to.
 */
const back = (here: string) =>
  shell()
    ? { redirectUri: `hanzo://oauth/${brand.org}`, postLogoutRedirectUri: undefined }
    : {
        redirectUri: `${here}${callbackPath}`,
        postLogoutRedirectUri: `${here}${loginPath}?redirect=false`,
      }
