import { listen } from '@tauri-apps/api/event';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useCallback, useEffect, useRef, useState } from 'react';

const IAM_BASE_URL = 'https://hanzo.id';
const IAM_CLIENT_ID = 'app-hanzo-desktop';
const IAM_REDIRECT_URI = 'hanzo://oauth/hanzo';
const IAM_SCOPE = 'openid profile email';

function generateRandomBytes(length: number): Uint8Array {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return array;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function computeS256Challenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(hash));
}

export type HanzoLoginState = {
  isLoading: boolean;
  error: string | null;
  tokens: { access_token: string; refresh_token: string } | null;
};

export const useHanzoLogin = () => {
  const [state, setState] = useState<HanzoLoginState>({
    isLoading: false,
    error: null,
    tokens: null,
  });

  const pkceRef = useRef<{ verifier: string; state: string } | null>(null);

  const startLogin = useCallback(async () => {
    setState({ isLoading: true, error: null, tokens: null });

    const verifier = base64UrlEncode(generateRandomBytes(48));
    const challenge = await computeS256Challenge(verifier);
    const oauthState = base64UrlEncode(generateRandomBytes(24));

    pkceRef.current = { verifier, state: oauthState };

    const params = new URLSearchParams({
      client_id: IAM_CLIENT_ID,
      response_type: 'code',
      redirect_uri: IAM_REDIRECT_URI,
      scope: IAM_SCOPE,
      state: oauthState,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });

    const authorizeUrl = `${IAM_BASE_URL}/login/oauth/authorize?${params.toString()}`;

    try {
      await openUrl(authorizeUrl);
    } catch (e) {
      console.error('Failed to open IAM login URL:', e);
      setState({ isLoading: false, error: 'Failed to open login page', tokens: null });
    }
  }, []);

  useEffect(() => {
    const unlisten = listen<{ state: string; code: string }>(
      'hanzo-iam-callback',
      async (event) => {
        const { state: callbackState, code } = event.payload;

        if (!pkceRef.current) {
          console.warn('Received IAM callback but no login was initiated');
          return;
        }

        if (callbackState !== pkceRef.current.state) {
          console.warn('OAuth state mismatch');
          setState({ isLoading: false, error: 'Login state mismatch', tokens: null });
          return;
        }

        try {
          const tokenResponse = await fetch(
            `${IAM_BASE_URL}/api/login/oauth/access_token`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                grant_type: 'authorization_code',
                client_id: IAM_CLIENT_ID,
                code,
                redirect_uri: IAM_REDIRECT_URI,
                code_verifier: pkceRef.current.verifier,
              }).toString(),
            },
          );

          if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text();
            console.error('Token exchange failed:', errorText);
            setState({
              isLoading: false,
              error: 'Failed to exchange authorization code',
              tokens: null,
            });
            return;
          }

          const tokenData = await tokenResponse.json();
          const tokens = {
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token ?? '',
          };

          setState({ isLoading: false, error: null, tokens });
          pkceRef.current = null;
        } catch (e) {
          console.error('Token exchange error:', e);
          setState({
            isLoading: false,
            error: 'Token exchange failed',
            tokens: null,
          });
        }
      },
    );

    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  const resetState = useCallback(() => {
    setState({ isLoading: false, error: null, tokens: null });
    pkceRef.current = null;
  }, []);

  return { ...state, startLogin, resetState };
};
