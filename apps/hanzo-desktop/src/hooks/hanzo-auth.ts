import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-shell';
import { useCallback, useRef, useState } from 'react';

// Hanzo IAM login — native (desktop) OAuth 2.0 Authorization Code + PKCE.
//
// This is a PUBLIC client: it ships NO client_secret. PKCE (S256) is what
// protects the code→token exchange, so a leaked binary can't be replayed.
// Endpoints are IAM's canonical paths — authorize is the interactive login
// page (/login/oauth/authorize); the token endpoint is /v1/iam/oauth/token
// (see https://hanzo.id/.well-known/openid-configuration).
// Canonical desktop client, declaratively provisioned in IAM (org hanzo,
// { app: app, type: desktop }) → clientId `hanzo-app`, deep-link
// hanzo://oauth/hanzo, PKCE public (no secret). Tokens carry aud=["hanzo-app"];
// first-party resource servers (studio, cloud) accept that audience.
const HANZO_CLIENT_ID = 'hanzo-app';
const HANZO_AUTHORIZE_URL = 'https://hanzo.id/login/oauth/authorize';
const HANZO_TOKEN_URL = 'https://hanzo.id/v1/iam/oauth/token';
const REDIRECT_URI = 'hanzo://oauth/hanzo';
// The Rust deep-link handler (deep_links.rs) routes the IAM redirect
// hanzo://oauth/hanzo (path /hanzo) to this event; provider-OAuth uses
// `oauth-deep-link`. Must match brand.config.ts `iam.callbackEvent`.
const IAM_CALLBACK_EVENT = 'hanzo-iam-callback';

export type HanzoTokens = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
};

// base64url(no-pad) of arbitrary bytes — used for both the state nonce and
// the PKCE code_verifier.
function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function randomUrlSafe(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

// PKCE S256: code_challenge = base64url(sha256(code_verifier)).
async function deriveCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier),
  );
  return base64UrlEncode(new Uint8Array(digest));
}

async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
): Promise<HanzoTokens> {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: HANZO_CLIENT_ID,
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: codeVerifier,
  });

  const response = await fetch(HANZO_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    throw new Error(`Token exchange failed: ${response.statusText}`);
  }

  return response.json() as Promise<HanzoTokens>;
}

export type UseHanzoLogin = {
  /**
   * Imperative login: opens the IAM authorize page, resolves with the tokens
   * once the deep-link round-trips. Also mirrors the result into the reactive
   * `tokens` / `isLoading` / `error` state so callers can either await the
   * promise or observe state — both stay in sync.
   */
  login: () => Promise<HanzoTokens>;
  /**
   * Fire-and-forget trigger for state-driven callers: runs `login()` and lets
   * the resulting `tokens` / `error` drive effects. Swallows the rejection
   * (it is surfaced via `error`) so there is no unhandled promise.
   */
  startLogin: () => void;
  /** Latest tokens, or null before a successful login. */
  tokens: HanzoTokens | null;
  /**
   * Ref mirror of `tokens`. Lets long-lived closures (e.g. a mutation's
   * `onSuccess`) read the freshest tokens without capturing a stale render
   * value — `tokens` (reactive) and `tokensRef.current` (closure-safe) are
   * written together.
   */
  tokensRef: React.RefObject<HanzoTokens | null>;
  /** True while an authorize→token round-trip is in flight. */
  isLoading: boolean;
  /** Last login error, or null. */
  error: Error | null;
  /** Clear `tokens` and `error` so the flow can be retried cleanly. */
  resetState: () => void;
};

export function useHanzoLogin(): UseHanzoLogin {
  const pendingState = useRef<string | null>(null);
  const pendingVerifier = useRef<string | null>(null);

  const [tokens, setTokens] = useState<HanzoTokens | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  // Ref mirror so closures that outlive a render (mutation onSuccess) read the
  // latest tokens instead of a value captured at first render.
  const tokensRef = useRef<HanzoTokens | null>(null);

  const login = useCallback(async (): Promise<HanzoTokens> => {
    setIsLoading(true);
    setError(null);

    const state = randomUrlSafe(32);
    const codeVerifier = randomUrlSafe(64);
    const codeChallenge = await deriveCodeChallenge(codeVerifier);
    pendingState.current = state;
    pendingVerifier.current = codeVerifier;

    const authUrl = new URL(HANZO_AUTHORIZE_URL);
    authUrl.searchParams.set('client_id', HANZO_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'openid profile email');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');

    await open(authUrl.toString());

    return new Promise<HanzoTokens>((resolve, reject) => {
      let settled = false;
      const finish = (result: HanzoTokens | Error) => {
        setIsLoading(false);
        if (result instanceof Error) {
          setError(result);
          reject(result);
        } else {
          tokensRef.current = result;
          setTokens(result);
          resolve(result);
        }
      };

      const unlistenPromise = listen(IAM_CALLBACK_EVENT, async (event) => {
        const payload = event.payload as { state: string; code: string };

        if (payload.state !== pendingState.current) return;
        if (settled) return;
        settled = true;

        clearTimeout(timeout);
        const verifier = pendingVerifier.current ?? '';
        pendingState.current = null;
        pendingVerifier.current = null;
        void unlistenPromise.then((fn) => fn());

        try {
          finish(await exchangeCodeForTokens(payload.code, verifier));
        } catch (err) {
          finish(err instanceof Error ? err : new Error(String(err)));
        }
      });

      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        pendingState.current = null;
        pendingVerifier.current = null;
        void unlistenPromise.then((fn) => fn());
        finish(new Error('OAuth login timed out'));
      }, 300_000); // 5 min timeout
    });
  }, []);

  const startLogin = useCallback(() => {
    // State-driven entry point: errors surface via `error`, not a throw.
    void login().catch(() => {
      /* handled via error state */
    });
  }, [login]);

  const resetState = useCallback(() => {
    tokensRef.current = null;
    setTokens(null);
    setError(null);
  }, []);

  return { login, startLogin, tokens, tokensRef, isLoading, error, resetState };
}
