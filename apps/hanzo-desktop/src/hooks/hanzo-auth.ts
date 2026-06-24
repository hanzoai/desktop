import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-shell';
import { useCallback, useRef } from 'react';

// Hanzo IAM login — native (desktop) OAuth 2.0 Authorization Code + PKCE.
//
// This is a PUBLIC client: it ships NO client_secret. PKCE (S256) is what
// protects the code→token exchange, so a leaked binary can't be replayed.
// Endpoints are IAM's canonical paths — authorize is the interactive login
// page (/login/oauth/authorize); the token endpoint is /v1/iam/oauth/token
// (see https://hanzo.id/.well-known/openid-configuration).
const HANZO_CLIENT_ID = 'hanzo-app-client-id';
const HANZO_AUTHORIZE_URL = 'https://hanzo.id/login/oauth/authorize';
const HANZO_TOKEN_URL = 'https://hanzo.id/v1/iam/oauth/token';
const REDIRECT_URI = 'hanzo://oauth/hanzo';

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

export function useHanzoLogin() {
  const pendingState = useRef<string | null>(null);
  const pendingVerifier = useRef<string | null>(null);

  const login = useCallback(async (): Promise<HanzoTokens> => {
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
      const unlistenPromise = listen('oauth-deep-link', async (event) => {
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
          const tokens = await exchangeCodeForTokens(payload.code, verifier);
          resolve(tokens);
        } catch (err) {
          reject(err);
        }
      });

      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        pendingState.current = null;
        pendingVerifier.current = null;
        void unlistenPromise.then((fn) => fn());
        reject(new Error('OAuth login timed out'));
      }, 300_000); // 5 min timeout
    });
  }, []);

  return { login };
}
