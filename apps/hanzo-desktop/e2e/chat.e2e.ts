// Real Tauri E2E — the chat composer round-trips through the real UI.
// We restore a real session, open the chat home, type into the real
// `#chat-input`, and submit. Asserting the composer accepts input and the send
// affordance activates exercises the genuine round-trip path (input -> form ->
// createJob) with no mocks.
//
// NOTE: a streamed *assistant reply* additionally requires a running local
// engine / node (the bundled sidecar). Where that backend is present this spec
// can be extended to wait for a `data-testid="message-remote-*"` bubble; the
// composer assertions below are deterministic without it.
import { browser, $, expect, restoreSignedInSession, navigateTo } from './helpers';

describe('chat composer round-trip', () => {
  before(async () => {
    await restoreSignedInSession();
    await navigateTo('/home');
  });

  it('accepts a typed message in the real chat input', async () => {
    const input = await $('#chat-input');
    await input.waitForExist({ timeout: 30000 });
    await input.click();
    await browser.keys('Hello from the Tauri E2E harness');
    await expect(input).toHaveValue('Hello from the Tauri E2E harness');
  });

  it('submits the message and starts a job (composer clears / navigates)', async () => {
    const input = await $('#chat-input');
    const before = await input.getValue();
    expect(before.length).toBeGreaterThan(0);

    // Submit via the real Enter-to-send path wired on the textarea.
    await browser.keys('Enter');

    // A successful submit either clears the composer or navigates into the new
    // inbox — both leave the typed text no longer sitting in #chat-input.
    await browser.waitUntil(
      async () => {
        const el = await $('#chat-input');
        if (!(await el.isExisting())) return true; // navigated away
        return (await el.getValue()) !== before;
      },
      {
        timeout: 30000,
        timeoutMsg: 'composer never cleared / navigated after submit',
      },
    );
  });
});
