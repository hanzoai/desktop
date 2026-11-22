import { getBrand } from '@hanzo/desktop-brand-config';
import type { useIam } from '@hanzo/iam/react';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';

import { share } from './identity';
import { awaitCallback, type Callback, finishAttempt, SignInCancelled } from './lib/sign-in-attempt';
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
 *
 * `signal` is the Welcome screen's Cancel; `ready` hands it "Open the sign-in
 * page again" once the page has been opened. The wait itself (the callback that
 * matches this attempt's state, the deadline, Cancel) is sign-in-attempt.ts.
 */
export async function signIn(
  sdk: Sdk,
  { signal, ready }: { signal?: AbortSignal; ready?: (reopen: () => void) => void } = {},
): Promise<void> {
  const ctrl = signal ?? new AbortController().signal;
  // The browser's hand-back is emitted as the event this brand's window listens on.
  const port = await invoke<number>('iam_loopback', { event: brand.iam.callbackEvent });
  if (ctrl.aborted) throw new SignInCancelled();
  const redirect = `http://127.0.0.1:${port}/callback`;
  // The SDK sends the redirect its configuration names at the code exchange, so
  // it names this attempt's before the authorize request is built.
  (sdk as unknown as { config: { redirectUri: string } }).config.redirectUri = redirect;
  const issuer = new URL(await sdk.getSigninUrl());
  const url = brand.iam.page ? `${brand.iam.page}${issuer.search}` : issuer.href;
  const open = () => openUrl(url);
  const back = await awaitCallback({
    state: issuer.searchParams.get('state') ?? '',
    listen: (on) => safeListen<Callback>(brand.iam.callbackEvent, (event) => on(event.payload)),
    open: async () => {
      await open();
      ready?.(() => void open().catch(() => undefined));
    },
    windowMs: SIGN_IN_WINDOW,
    signal: ctrl,
  });
  // The browser came back with this attempt's state: the exchange decides now.
  const callback = new URL(redirect);
  callback.searchParams.set('code', back.code);
  callback.searchParams.set('state', back.state);
  await finishAttempt(ctrl, {
    exchange: () => sdk.handleCallback(callback.href),
    forget: () => sdk.clearTokens(),
    then: [share, () => window.location.replace(onward())],
  });
}
