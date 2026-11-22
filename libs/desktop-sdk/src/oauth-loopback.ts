/**
 * One sign-in attempt's wait for the browser to come back, without React or
 * Tauri so its edges are testable: the callback, the deadline, and Cancel.
 *
 * Each attempt asks the system for its own loopback port, and a port stays open
 * after its attempt is abandoned (loopback.rs closes it on its own clock). So a
 * reader who cancels and signs in again can still finish the FIRST page in the
 * browser, and that callback arrives on the same event as the second's. Only a
 * callback carrying this attempt's OAuth `state` is ours; any other is ignored,
 * not treated as a failure, so a stale tab cannot spoil the attempt in progress.
 */

export interface Callback {
  state: string;
  code: string;
}

/** Cancel was pressed: the UI goes back to idle and says nothing went wrong. */
export class SignInCancelled extends Error {
  override name = 'SignInCancelled';
  constructor() {
    super('Sign-in was cancelled.');
  }
}

export const EXPIRED_MESSAGE =
  'The sign-in page was not finished in time, so this attempt has stopped. Sign in again to get a new page.';

export function awaitCallback({
  state,
  listen,
  open,
  windowMs,
  signal,
}: {
  /** The `state` of the authorize request this attempt opened. */
  state: string;
  /** Subscribes to callbacks; resolves to the unsubscribe. */
  listen: (on: (cb: Callback) => void) => Promise<(() => void) | null | undefined>;
  /** Opens the sign-in page, once the subscription is in place. */
  open: () => Promise<unknown>;
  windowMs: number;
  signal?: AbortSignal;
}): Promise<Callback> {
  return new Promise<Callback>((resolve, reject) => {
    let settled = false;
    let stop: (() => void) | null | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onAbort = () => finish(() => reject(new SignInCancelled()));
    const finish = (settle: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      stop?.();
      settle();
    };

    if (signal?.aborted) return onAbort();
    timer = setTimeout(() => finish(() => reject(new Error(EXPIRED_MESSAGE))), windowMs);
    signal?.addEventListener('abort', onAbort, { once: true });

    listen((cb) => {
      if (cb.state === state) finish(() => resolve(cb));
    })
      .then((unlisten) => {
        // Cancelled while the subscription was still being made: drop it now.
        if (settled) return unlisten?.();
        stop = unlisten;
        return open();
      })
      .then(undefined, (err: unknown) => finish(() => reject(err)));
  });
}

/**
 * What happens once the browser came back: the code exchange, then the rest
 * (handing the session over, leaving the Welcome screen). The exchange is a
 * network call and STORES the tokens, so Cancel can land while it runs; then
 * `forget` takes back every key it stored before Cancel is honoured, or the
 * window would hold a refresh token and a session under the Welcome screen.
 * Once the exchange has stood, the rest runs to the end: it is local and
 * quick, and the hand-over files the session where a later start adopts it,
 * so stopping part-way would be the same half sign-in again.
 */
export async function finishAttempt(
  signal: AbortSignal | undefined,
  { exchange, forget, then }: { exchange: () => unknown; forget: () => unknown; then: Array<() => unknown> },
): Promise<void> {
  if (signal?.aborted) throw new SignInCancelled();
  await exchange();
  if (signal?.aborted) {
    await forget();
    throw new SignInCancelled();
  }
  for (const step of then) await step();
}
