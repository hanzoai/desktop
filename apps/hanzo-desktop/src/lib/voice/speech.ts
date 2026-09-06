import { speech as transport, type Speech } from '@hanzo/voice';
import { fetch as native } from '@tauri-apps/plugin-http';

/**
 * The platform's speech services, as this app reaches them.
 *
 * The machine is `@hanzo/voice` — the same one hanzo.chat and hanzo.app hold.
 * Only the last two inches differ, and the package already takes both as
 * arguments, so there is no second implementation here: a transport and an
 * identity, nothing more.
 *
 * The wire. A page served from `tauri://localhost` is a cross-origin caller to
 * api.hanzo.ai, and the gateway answers that origin with no CORS headers at all
 * — a webview `fetch` never leaves the process. The Tauri HTTP client makes the
 * request from Rust, where same-origin policy does not apply. The one URL it may
 * call is declared in `capabilities/main.json`.
 *
 * The payer. The bearer is the signed-in user's own IAM token, so the turn is
 * attributed to them and billed against the org they actually belong to — the
 * gateway resolves that from the verified principal, and honours a client's own
 * `X-Org-Id` only when it names an org that principal already had. This app has
 * no scope picker, so it asserts none. Nothing anonymous ships either: without a
 * sign-in there is no voice, and the button says so.
 */

/** Where `/v1/audio/*` lives. */
const GATEWAY = 'https://api.hanzo.ai';

/**
 * What api.hanzo.ai actually serves. The package's OpenAI-shaped defaults
 * (`whisper-1`, `tts-1`, `alloy`) are not names on this gateway — they come back
 * 404 — so they are stated rather than inherited.
 *
 * `wav` because the reply is played by the webview: WebKitGTK decodes it without
 * the extra GStreamer plugins mp3 needs, and it is the one format kokoro writes
 * directly instead of re-encoding.
 */
const EAR = 'whisper';
const MOUTH = { model: 'kokoro', name: 'af_heart', format: 'wav' };

/** The speech services, bound to whoever is signed in. */
export function speech(token: () => string | null): Speech {
  return transport({
    baseUrl: GATEWAY,
    token,
    ear: EAR,
    voice: MOUTH,
    fetch: native as unknown as typeof fetch,
  });
}
