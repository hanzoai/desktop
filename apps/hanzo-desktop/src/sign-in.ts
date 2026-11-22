import { getBrand } from '@hanzo/desktop-brand-config';
import type { useIam } from '@hanzo/iam/react';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';

import { share } from './identity';
import { safeListen } from './utils/tauri-check';

type Sdk = ReturnType<typeof useIam>['sdk'];

const brand = getBrand();

/** Where a sign-in started from /login?next= goes on to, on this origin only. */
export function onward(): string {
  const next = new URLSearchParams(window.location.search).get('next');
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/chat';
}

/** How long the loopback port waits for the browser: `PATIENCE` in loopback.rs. */
const SIGN_IN_WINDOW = 15 * 60 * 1000;

/**
 * Sign-in in the system browser, as the Hanzo CLI signs in: a loopback port the
 * system picks for this attempt is the redirect (RFC 8252 §7.3), and the page
 * the browser opens is the brand's own (hanzo.ai/login), which finishes this
 * app's authorize request. PKCE's verifier and the state stay in this window's
 * storage, where the callback is read.
 */
export async function signIn(sdk: Sdk): Promise<void> {
  const port = await invoke<number>('iam_loopback');
  const redirect = `http://127.0.0.1:${port}/callback`;
  // The SDK sends the redirect its configuration names at the code exchange, so
  // it names this attempt's before the authorize request is built.
  (sdk as unknown as { config: { redirectUri: string } }).config.redirectUri = redirect;
  const issuer = new URL(await sdk.getSigninUrl());
  const url = brand.iam.page ? `${brand.iam.page}${issuer.search}` : issuer.href;
  // The loopback port closes after SIGN_IN_WINDOW (loopback.rs) and nothing can
  // come back once it has. Without the timer a reader who closed the browser
  // tab kept a disabled "Finish signing in…" button until the app was quit, and
  // every retry left another listener behind.
  let stop: (() => void) | null = null;
  let expire: ReturnType<typeof setTimeout> | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      expire = setTimeout(
        () => reject(new Error('Sign-in was not finished in the browser. Try again.')),
        SIGN_IN_WINDOW,
      );
      void safeListen<{ state: string; code: string }>(brand.iam.callbackEvent, (event) => {
        // The browser came back: the exchange below decides the outcome now.
        clearTimeout(expire);
        const back = new URL(redirect);
        back.searchParams.set('code', event.payload.code);
        back.searchParams.set('state', event.payload.state);
        sdk
          .handleCallback(back.href)
          .then(() => share())
          .then(() => resolve(), reject);
      })
        .then((unlisten) => {
          stop = unlisten;
          return openUrl(url);
        })
        .then(undefined, reject);
    });
  } finally {
    clearTimeout(expire);
    (stop as (() => void) | null)?.();
  }
  window.location.replace(onward());
}
