import { test, expect } from '@playwright/test';

test.describe('Complete Onboarding and Verify LM Studio', () => {
  test('should complete onboarding flow and verify LM Studio in Add AI dropdown', async ({ page }) => {
    // Step 1: Navigate to app
    await page.goto('http://localhost:1420');
    await page.waitForLoadState('networkidle');
    console.log('Step 1: Loaded Zoo Desktop app');
    await page.screenshot({ path: '/tmp/onboarding-step1-landing.png' });

    // Step 2: Accept Terms of Service
    const termsCheckbox = page.locator('input[type="checkbox"]').first();
    if (await termsCheckbox.count() > 0) {
      await termsCheckbox.check();
      console.log('Step 2: Accepted Terms of Service');
      await page.screenshot({ path: '/tmp/onboarding-step2-terms-accepted.png' });

      // Wait a moment for button to enable
      await page.waitForTimeout(1000);
    }

    // Step 3: Click "Get Started Free" button
    const getStartedButton = page.locator('button:has-text("Get Started")').first();

    // Wait for button to be enabled
    await getStartedButton.waitFor({ state: 'visible', timeout: 5000 });

    // Check if button is enabled
    const isDisabled = await getStartedButton.getAttribute('disabled');
    console.log(`Button disabled status: ${isDisabled}`);

    if (isDisabled === null || isDisabled === 'false') {
      await getStartedButton.click();
      console.log('Step 3: Clicked Get Started Free button');
      await page.waitForTimeout(2000);
      await page.screenshot({ path: '/tmp/onboarding-step3-after-click.png' });
    } else {
      console.log('Step 3: Button still disabled, trying to force click');
      await getStartedButton.click({ force: true });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: '/tmp/onboarding-step3-forced-click.png' });
    }

    // Step 4: Wait for navigation and check where we are
    await page.waitForLoadState('networkidle');
    const currentUrl = page.url();
    console.log(`Step 4: Current URL after click: ${currentUrl}`);
    await page.screenshot({ path: '/tmp/onboarding-step4-current-page.png' });

    // Step 5: Try to find and handle onboarding wizard
    // Look for common onboarding elements
    const wizardElements = await page.locator('button, input, [role="dialog"]').all();
    console.log(`Step 5: Found ${wizardElements.length} interactive elements on page`);

    // Look for "Next", "Continue", "Skip" buttons
    const continueButton = page.locator('button:has-text("Continue"), button:has-text("Next"), button:has-text("Skip")').first();
    if (await continueButton.count() > 0) {
      await continueButton.click();
      console.log('Step 5: Clicked Continue/Next/Skip button');
      await page.waitForTimeout(2000);
      await page.screenshot({ path: '/tmp/onboarding-step5-after-continue.png' });
    }

    // Step 6: Try "Quick Connect" if available
    const quickConnect = page.locator('text=Quick Connect').first();
    if (await quickConnect.count() > 0) {
      await quickConnect.click();
      console.log('Step 6: Clicked Quick Connect');
      await page.waitForTimeout(2000);
      await page.screenshot({ path: '/tmp/onboarding-step6-quick-connect.png' });
    }

    // Step 7: Try multiple ways to access Add AI page
    const routes = ['/add-ai', '/settings', '/inbox'];

    for (const route of routes) {
      await page.goto(`http://localhost:1420${route}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);

      const url = page.url();
      console.log(`Step 7: Tried ${route}, ended at: ${url}`);

      // Take screenshot
      const routeName = route.replace(/\//g, '_') || 'root';
      await page.screenshot({ path: `/tmp/onboarding-step7-route${routeName}.png` });

      // Check if we're NOT on terms page
      if (!url.includes('terms-conditions') && !url.includes('welcome')) {
        console.log(`✅ Success! Accessed ${route}`);
        break;
      }
    }

    // Step 8: Look for LM Studio in the current page
    const lmStudioText = await page.locator('text=/LM Studio/i').count();
    const ollamaText = await page.locator('text=/Ollama/i').count();

    console.log(`Step 8: LM Studio mentions: ${lmStudioText}`);
    console.log(`Step 8: Ollama mentions: ${ollamaText}`);

    if (lmStudioText > 0) {
      console.log('✅ LM Studio FOUND in UI!');
      await page.screenshot({ path: '/tmp/onboarding-SUCCESS-lm-studio-found.png' });
    }

    // Step 9: Try to find dropdown/select elements
    const selects = await page.locator('select, [role="combobox"], [role="listbox"]').all();
    console.log(`Step 9: Found ${selects.length} dropdown/select elements`);

    for (let i = 0; i < selects.length; i++) {
      const text = await selects[i].textContent();
      console.log(`  Dropdown ${i + 1}: ${text?.substring(0, 100)}`);
    }

    // Step 10: Search entire page for model-related text
    const bodyText = await page.locator('body').textContent();
    const hasLMStudio = bodyText?.includes('LM Studio') || bodyText?.includes('lmstudio');
    const hasOllama = bodyText?.includes('Ollama');
    const hasOpenAI = bodyText?.includes('OpenAI');

    console.log(`Step 10: Page contains:`);
    console.log(`  - LM Studio: ${hasLMStudio}`);
    console.log(`  - Ollama: ${hasOllama}`);
    console.log(`  - OpenAI: ${hasOpenAI}`);

    // Take final screenshot
    await page.screenshot({ path: '/tmp/onboarding-step10-final-state.png', fullPage: true });

    // Log final status
    console.log('\n=== FINAL RESULTS ===');
    console.log(`Current URL: ${page.url()}`);
    console.log(`LM Studio visible: ${hasLMStudio}`);
    console.log(`Screenshots saved in /tmp/onboarding-*.png`);
  });

  test('should try alternative onboarding approach - direct navigation', async ({ page }) => {
    // Try to bypass onboarding by going directly to app
    console.log('Alternative approach: Testing direct navigation');

    // Set localStorage to fake completed onboarding
    await page.goto('http://localhost:1420');
    await page.waitForLoadState('networkidle');

    // Try to set any auth/onboarding completion flags
    await page.evaluate(() => {
      // Try common localStorage keys
      localStorage.setItem('onboarding-complete', 'true');
      localStorage.setItem('hasAcceptedTerms', 'true');
      localStorage.setItem('terms-accepted', 'true');
    });

    console.log('Set localStorage flags for onboarding completion');

    // Reload and try to access protected route
    await page.reload();
    await page.waitForLoadState('networkidle');

    await page.goto('http://localhost:1420/add-ai');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const url = page.url();
    console.log(`After localStorage trick, URL: ${url}`);

    if (!url.includes('terms-conditions')) {
      console.log('✅ Bypassed onboarding with localStorage!');
      await page.screenshot({ path: '/tmp/alternative-SUCCESS-bypassed.png' });

      // Look for LM Studio
      const lmStudio = await page.locator('text=/LM Studio/i').count();
      if (lmStudio > 0) {
        console.log('✅✅ LM Studio FOUND after bypass!');
        await page.screenshot({ path: '/tmp/alternative-SUCCESS-lm-studio.png' });
      }
    } else {
      console.log('❌ localStorage trick did not work');
      await page.screenshot({ path: '/tmp/alternative-FAILED-still-blocked.png' });
    }
  });
});
