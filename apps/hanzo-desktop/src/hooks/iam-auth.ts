import { getBrand, type BrandConfig } from '@hanzo/desktop-brand-config';
import { open } from '@tauri-apps/plugin-shell';
import { useCallback, useRef, useState } from 'react';

import { iamUrl } from '../lib/iam-oidc';
import { secureStorage } from '../lib/secure-storage';
import { safeListen } from '../utils/tauri-check';

// Desktop sign-in against the ACTIVE BRAND's IAM — OAuth 2.0 Authorization Code
// + PKCE (S256).
//
// Nothing here names a brand. The auth host, OAuth client, deep-link redirect
// and callback event all come from `getBrand().iam` (libs/brand-config), so a
// Zoo build talks to zoolabs.id with client `zoo-app` and a Lux build to lux.id
// with `lux-app`. This file used to hardcode hanzo.id / `hanzo-app` /
// `hanzo-iam-callback`, which meant every branded build sent its users to
// Hanzo's IdP.
//
// This is a PUBLIC client: it ships NO client_secret. PKCE is what protects the
// code→token exchange, so a leaked binary cannot be replayed.

export type IamTokens = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
};

type Iam = BrandConfig['iam'];

/** Keychain record holding the current brand's IAM session. */
const TOKENS_KEY = 'iam-tokens';

/** Read the persisted IAM session, or null when signed out. */
export async function loadIamTokens(): Promise<IamTokens | null> {
  const raw = await secureStorage.getItem(TOKENS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as IamTokens;
  } catch {
    return null;
  }
}

/** Drop the persisted IAM session (sign out). */
export async function clearIamTokens(): Promise<void> {
  await secureStorage.removeItem(TOKENS_KEY);
}

// base64url (no pad) — used for the state nonce, the PKCE verifier and the
// SHA-256 challenge.
function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomUrlSafe(byteLength: number): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(byteLength)));
}

/** PKCE S256: code_challenge = base64url(sha256(code_verifier)). */
async function deriveCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

/**
 * Build the brand's authorize request. Pure and exported so the authorize URL
 * a given brand produces is directly assertable in a test — that assertion is
 * the white-label guarantee (a zoo build must never point at hanzo.id).
 */
export async function createAuthorizeRequest(
  iam: Iam,
): Promise<{ url: string; state: string; codeVerifier: string }> {
  const state = randomUrlSafe(32);
  const codeVerifier = randomUrlSafe(64);
  const url = new URL(iamUrl(iam.baseUrl, 'authorize'));
  url.searchParams.set('client_id', iam.clientId);
  url.searchParams.set('redirect_uri', iam.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid profile email');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', await deriveCodeChallenge(codeVerifier));
  url.searchParams.set('code_challenge_method', 'S256');
  return { url: url.toString(), state, codeVerifier };
}

async function exchangeCodeForTokens(
  iam: Iam,
  code: string,
  codeVerifier: string,
): Promise<IamTokens> {
  const response = await fetch(iamUrl(iam.baseUrl, 'token'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: iam.clientId,
      code,
      redirect_uri: iam.redirectUri,
      code_verifier: codeVerifier,
    }).toString(),
  });
  if (!response.ok) {
    throw new Error(`Token exchange failed: ${response.statusText}`);
  }
  return (await response.json()) as IamTokens;
}

export type UseIamLogin = {
  /**
   * Imperative login: opens the brand's authorize page in the system browser,
   * resolves with the tokens once the deep-link round-trips, and writes them to
   * the OS keychain. Also mirrors the result into the reactive state so callers
   * can either await the promise or observe state — both stay in sync.
   */
  login: () => Promise<IamTokens>;
  /** Fire-and-forget trigger; failures surface via `error`, never as a throw. */
  startLogin: () => void;
  /** Latest tokens, or null before a successful login. */
  tokens: IamTokens | null;
  /**
   * Ref mirror of `tokens`, for closures that outlive a render (e.g. a
   * mutation's `onSuccess`) and would otherwise read a stale value.
   */
  tokensRef: React.RefObject<IamTokens | null>;
  /** True while an authorize→token round-trip is in flight. */
  isLoading: boolean;
  /** Last login error, or null. */
  error: Error | null;
  /** Clear `tokens` and `error` so the flow can be retried cleanly. */
  resetState: () => void;
};

export function useIamLogin(): UseIamLogin {
  const { iam } = getBrand();
  const pendingState = useRef<string | null>(null);
  const pendingVerifier = useRef<string | null>(null);

  const [tokens, setTokens] = useState<IamTokens | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const tokensRef = useRef<IamTokens | null>(null);

  const login = useCallback(async (): Promise<IamTokens> => {
    setIsLoading(true);
    setError(null);

    const request = await createAuthorizeRequest(iam);
    pendingState.current = request.state;
    pendingVerifier.current = request.codeVerifier;

    await open(request.url);

    return new Promise<IamTokens>((resolve, reject) => {
      let settled = false;
      const finish = (result: IamTokens | Error) => {
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

      // The brand's own callback event, emitted by the Rust deep-link handler
      // for `<scheme>://oauth/<brand>` (src-tauri/src/deep_links.rs).
      const unlistenPromise = safeListen<{ state: string; code: string }>(
        iam.callbackEvent,
        (event) => {
          const payload = event.payload;
          // A callback whose state does not match the one we minted is not ours
          // (CSRF / replay) — ignore it.
          if (payload.state !== pendingState.current || settled) return;
          settled = true;

          clearTimeout(timeout);
          const verifier = pendingVerifier.current ?? '';
          pendingState.current = null;
          pendingVerifier.current = null;
          void unlistenPromise.then((fn) => fn?.());

          void (async () => {
            try {
              const result = await exchangeCodeForTokens(iam, payload.code, verifier);
              // Straight to the OS keychain — a bearer token must never reach
              // localStorage.
              await secureStorage.setItem(TOKENS_KEY, JSON.stringify(result));
              finish(result);
            } catch (err) {
              finish(err instanceof Error ? err : new Error(String(err)));
            }
          })();
        },
      );

      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        pendingState.current = null;
        pendingVerifier.current = null;
        void unlistenPromise.then((fn) => fn?.());
        finish(new Error('OAuth login timed out'));
      }, 300_000); // 5 min
    });
  }, [iam]);

  const startLogin = useCallback(() => {
    void login().catch(() => {
      /* surfaced via `error` */
    });
  }, [login]);

  const resetState = useCallback(() => {
    tokensRef.current = null;
    setTokens(null);
    setError(null);
  }, []);

  return { login, startLogin, tokens, tokensRef, isLoading, error, resetState };
}
