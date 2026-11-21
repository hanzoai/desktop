import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-shell';
import { useCallback, useRef } from 'react';

const HANZO_CLIENT_ID = 'hanzo-app-client-id';
const HANZO_CLIENT_SECRET = '3c7c4d9817bf0993681f6da2605e07ba5949da87a32862ed';
const HANZO_AUTH_URL = 'https://hanzo.id/login/oauth/authorize';
const HANZO_TOKEN_URL = 'https://hanzo.id/oauth/token';
const REDIRECT_URI = 'hanzo://oauth/hanzo';

export type HanzoTokens = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
};

function generateState(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function exchangeCodeForTokens(code: string): Promise<HanzoTokens> {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: HANZO_CLIENT_ID,
    client_secret: HANZO_CLIENT_SECRET,
    code,
    redirect_uri: REDIRECT_URI,
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

  const login = useCallback(async (): Promise<HanzoTokens> => {
    const state = generateState();
    pendingState.current = state;

    const authUrl = new URL(HANZO_AUTH_URL);
    authUrl.searchParams.set('client_id', HANZO_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'openid profile email');
    authUrl.searchParams.set('state', state);

    await open(authUrl.toString());

    return new Promise<HanzoTokens>((resolve, reject) => {
      let settled = false;
      const unlistenPromise = listen('oauth-deep-link', async (event) => {
        const payload = event.payload as { state: string; code: string };

        if (payload.state !== pendingState.current) return;
        if (settled) return;
        settled = true;

        clearTimeout(timeout);
        pendingState.current = null;
        void unlistenPromise.then((fn) => fn());

        try {
          const tokens = await exchangeCodeForTokens(payload.code);
          resolve(tokens);
        } catch (err) {
          reject(err);
        }
      });

      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        pendingState.current = null;
        void unlistenPromise.then((fn) => fn());
        reject(new Error('OAuth login timed out'));
      }, 300_000); // 5 min timeout
    });
  }, []);

  return { login };
}
