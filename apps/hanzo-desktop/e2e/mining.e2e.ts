// Real Tauri E2E — the mining / wallet panel renders with its real DOM.
// Mining lives behind a ProtectedRoute, so we first restore a real signed-in
// session (the same persisted localStorage the app writes for a returning
// user), then navigate to /mining and assert the panel's stable test-ids.
import { $, expect, restoreSignedInSession, navigateTo } from './helpers';

describe('mining / wallet panel', () => {
  before(async () => {
    await restoreSignedInSession();
    await navigateTo('/mining');
  });

  it('renders the mining page shell', async () => {
    const page = await $('[data-testid="mining-page"]');
    await page.waitForExist({ timeout: 30000 });
    await expect(page).toBeExisting();
  });

  it('shows the on-chain and pending balance widgets', async () => {
    await expect($('[data-testid="onchain-balance"]')).toBeExisting();
    await expect($('[data-testid="pending-balance"]')).toBeExisting();
  });

  it('shows the privacy-tier selector with all four tiers', async () => {
    await expect($('[data-testid="privacy-selector"]')).toBeExisting();
    for (const tier of ['public', 'private', 'confidential', 'sovereign']) {
      await expect($(`[data-testid="privacy-${tier}"]`)).toBeExisting();
    }
  });

  it('shows the recent-proofs table', async () => {
    await expect($('[data-testid="recent-proofs"]')).toBeExisting();
  });
});
