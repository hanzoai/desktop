import { getBrand } from '@hanzo_network/brand-config';
import { IAM, type IAMToken } from '@hanzo/iam/browser';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-shell';
import { useCallback, useMemo, useRef, useState } from 'react';

// Hanzo IAM login — native (desktop) OAuth 2.0 Authorization Code + PKCE.
//
// The PKCE mechanics (verifier/challenge/state generation, the code→token
// exchange, discovery of the authorize/token endpoints) are owned by the
// canonical `@hanzo/iam` SDK — the SAME implementation the web app, chat and
// console ship. This hook is only the native glue: open the authorize URL in
// the system browser and complete the exchange when the OS deep-links back.
//
// This is a PUBLIC client: it ships NO client_secret. The SDK enforces
// PKCE-S256, so a leaked binary can't replay the code. Endpoints and the
// custom-scheme redirect (`hanzo://oauth/hanzo`) come from the active brand's
// IAM config (`libs/brand-config`) — one endpoint source, brand-white-labeled.

export type HanzoTokens = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
};

/** Map the SDK's canonical (camelCase) token to the hook's snake_case contract. */
function toHanzoTokens(t: IAMToken): HanzoTokens {
  return {
    access_token: t.accessToken,
    refresh_token: t.refreshToken ?? '',
    token_type: t.tokenType ?? 'Bearer',
    expires_in: t.expiresIn ?? 0,
  };
}

/** Build an IAM client from the active brand's IAM config. */
function makeIam(): IAM {
  const { iam } = getBrand();
  return new IAM({
    serverUrl: iam.baseUrl,
    clientId: iam.clientId,
    application: iam.clientId,
    redirectUri: iam.redirectUri,
    scope: 'openid profile email',
    // localStorage survives the browser round-trip so the SDK can match the
    // PKCE verifier + state it stashed in `getSigninUrl` when we complete the
    // exchange in `handleCallback`.
    storage:
      typeof window !== 'undefined' ? window.localStorage : undefined,
  });
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
  const iam = useMemo(() => makeIam(), []);
  const redirectUri = useMemo(() => getBrand().iam.redirectUri, []);

  const [tokens, setTokens] = useState<HanzoTokens | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  // Ref mirror so closures that outlive a render (mutation onSuccess) read the
  // latest tokens instead of a value captured at first render.
  const tokensRef = useRef<HanzoTokens | null>(null);

  const login = useCallback(async (): Promise<HanzoTokens> => {
    setIsLoading(true);
    setError(null);

    // SDK builds the authorize URL AND stashes the PKCE verifier + state; the
    // same stash is read back in `handleCallback` to validate + exchange.
    const authUrl = await iam.getSigninUrl();
    await open(authUrl);

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

      const unlistenPromise = listen('oauth-deep-link', async (event) => {
        if (settled) return;
        const payload = event.payload as { state: string; code: string };
        settled = true;

        clearTimeout(timeout);
        void unlistenPromise.then((fn) => fn());

        try {
          // Reconstruct the callback URL the SDK expects; it validates `state`
          // against the stashed value and completes the PKCE exchange.
          const callbackUrl = `${redirectUri}?code=${encodeURIComponent(
            payload.code,
          )}&state=${encodeURIComponent(payload.state)}`;
          finish(toHanzoTokens(await iam.handleCallback(callbackUrl)));
        } catch (err) {
          finish(err instanceof Error ? err : new Error(String(err)));
        }
      });

      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        void unlistenPromise.then((fn) => fn());
        finish(new Error('OAuth login timed out'));
      }, 300_000); // 5 min timeout
    });
  }, [iam, redirectUri]);

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
