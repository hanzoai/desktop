// Real Tauri E2E — the login control is present and behaves.
// The onboarding screen always offers a "Login" button (cloud sign-in) and a
// "Skip" button (local-only). The Login button is gated on accepting the terms
// checkbox — a real interaction we exercise here, no mocks.
import { $, expect, waitForAppMounted, navigateTo } from './helpers';

describe('login button', () => {
  before(async () => {
    await waitForAppMounted();
    // Make sure we're on the onboarding/terms screen regardless of prior spec.
    await navigateTo('/terms-conditions');
  });

  it('shows the Login button on the onboarding screen', async () => {
    const login = await $('button=Login');
    await login.waitForExist({ timeout: 30000 });
    await expect(login).toBeExisting();
  });

  it('shows the local-only "Skip" path alongside cloud Login', async () => {
    await expect($('button=Skip')).toBeExisting();
  });

  it('enables Login only after the terms checkbox is accepted', async () => {
    const login = await $('button=Login');
    // Before accepting terms the button is disabled.
    await expect(login).toBeDisabled();

    // Accept the terms — the checkbox is a radix Checkbox (role=checkbox).
    const checkbox = await $('[role="checkbox"]');
    await checkbox.waitForClickable({ timeout: 15000 });
    await checkbox.click();

    await expect(login).toBeEnabled();
  });
});
