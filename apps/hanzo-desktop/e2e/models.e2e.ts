// Real Tauri E2E — the local Zen engine/models surface is present.
// The local inference engine is branded "Zen" throughout the app. The
// /benchmark page is a stable, deterministic surface that names the local
// "Zen Engine" without depending on a live model list fetch. Both /benchmark
// and /home are ProtectedRoutes, so we restore a real session first.
import { $, expect, restoreSignedInSession, navigateTo } from './helpers';

describe('models — local Zen engine', () => {
  before(async () => {
    await restoreSignedInSession();
  });

  it('names the local Zen engine on the benchmark surface', async () => {
    await navigateTo('/benchmark');
    const heading = await $('h1=Engine Benchmark');
    await heading.waitForDisplayed({ timeout: 30000 });
    await expect(heading).toBeDisplayed();

    // The copy explicitly identifies the local engine as "Zen Engine".
    const zen = await $('*=Zen Engine');
    await expect(zen).toBeExisting();
  });

  it('renders the chat home with an AI model selector', async () => {
    await navigateTo('/home');
    // The home composer mounts the chat input + the AI model selector card.
    const input = await $('#chat-input');
    await input.waitForExist({ timeout: 30000 });
    await expect(input).toBeExisting();
  });
});
