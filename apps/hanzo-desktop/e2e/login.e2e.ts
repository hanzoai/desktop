// Real Tauri E2E — the sign-in control on the LIVE onboarding surface.
//
// The live main window is the converged Tamagui shell (`src/hanzo/Welcome.tsx`),
// not the pre-convergence `/terms-conditions` route this spec used to drive. It
// offers one cloud path ("Sign in with <Brand>") and one local path ("Continue
// without an account"), both gated on the terms checkbox.
//
// The button is labelled with the ACTIVE BRAND, so the assertion is brand-driven
// too: a Zoo build says "Sign in with Zoo" and a Lux build "Sign in with Lux".
// Set BRAND to match the binary under test (brand-build.cjs sets the same value
// as VITE_BRAND at build time).
import { $, expect, waitForAppMounted } from './helpers';

const BRAND_NAME =
  ({ hanzo: 'Hanzo', zoo: 'Zoo', lux: 'Lux' } as const)[
    (process.env.BRAND ?? 'hanzo') as 'hanzo' | 'zoo' | 'lux'
  ] ?? 'Hanzo';

describe('sign in', () => {
  before(async () => {
    await waitForAppMounted();
  });

  it(`shows "Sign in with ${BRAND_NAME}" on the onboarding screen`, async () => {
    const signIn = await $(`button=Sign in with ${BRAND_NAME}`);
    await signIn.waitForExist({ timeout: 30000 });
    await expect(signIn).toBeExisting();
  });

  it('shows the local-only path alongside cloud sign-in', async () => {
    await expect($('button=Continue without an account')).toBeExisting();
  });

  it('enables sign-in only after the terms are accepted', async () => {
    const signIn = await $(`button=Sign in with ${BRAND_NAME}`);
    await expect(signIn).toBeDisabled();

    // The terms row is the whole label — pressing it toggles the checkbox.
    const terms = await $('*=I agree to the Terms of Service');
    await terms.waitForClickable({ timeout: 15000 });
    await terms.click();

    await expect(signIn).toBeEnabled();
  });
});
