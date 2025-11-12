import { test, expect } from '@playwright/test';

test.describe('Navigate to Chat Interface', () => {
  test('should navigate past welcome screen to chat', async ({ page }) => {
    await page.goto('http://localhost:1420');
    await page.waitForLoadState('networkidle');

    // Take screenshot of landing page
    await page.screenshot({ path: '/tmp/zoo-step1-landing.png' });
    console.log('Step 1: Landing page captured');

    // Try to find and click "Get Started Free" button
    const getStartedButton = page.locator('button:has-text("Get Started")').first();
    const buttonExists = await getStartedButton.count() > 0;

    if (buttonExists) {
      console.log('Found "Get Started" button, clicking...');

      // Accept terms if checkbox exists
      const termsCheckbox = page.locator('input[type="checkbox"]').first();
      if (await termsCheckbox.count() > 0) {
        await termsCheckbox.check();
        console.log('Accepted terms');
      }

      await getStartedButton.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: '/tmp/zoo-step2-after-start.png' });
      console.log('Step 2: After clicking Get Started');
    }

    // Try "Quick Connect" link if it exists
    const quickConnect = page.locator('text=Quick Connect').first();
    if (await quickConnect.count() > 0) {
      console.log('Found "Quick Connect" link');
      await page.screenshot({ path: '/tmp/zoo-quick-connect-option.png' });
    }

    // Look for any links or navigation
    const allLinks = await page.locator('a').all();
    console.log(`Found ${allLinks.length} links on page`);

    // Check all visible text for debugging
    const bodyText = await page.locator('body').textContent();
    console.log('Page contains text:', bodyText?.substring(0, 200));
  });

  test('should explore all routes in the app', async ({ page }) => {
    await page.goto('http://localhost:1420');
    await page.waitForLoadState('networkidle');

    // Try different common routes
    const routes = [
      '/',
      '/chat',
      '/agents',
      '/settings',
      '/add-ai',
      '/inbox',
      '/conversation',
    ];

    for (const route of routes) {
      try {
        await page.goto(`http://localhost:1420${route}`);
        await page.waitForLoadState('networkidle');

        const title = await page.title();
        const url = page.url();
        const hasContent = await page.locator('body').textContent();

        console.log(`Route ${route}:`);
        console.log(`  - Title: ${title}`);
        console.log(`  - URL: ${url}`);
        console.log(`  - Has content: ${hasContent ? 'Yes' : 'No'}`);

        // Take screenshot
        const safeName = route.replace(/\//g, '_') || 'root';
        await page.screenshot({ path: `/tmp/zoo-route${safeName}.png` });
      } catch (e) {
        console.log(`Route ${route} failed:`, e);
      }
    }
  });

  test('should look for chat input in all routes', async ({ page }) => {
    const routes = ['/', '/chat', '/inbox', '/conversation'];

    for (const route of routes) {
      await page.goto(`http://localhost:1420${route}`);
      await page.waitForLoadState('networkidle');

      // Look for chat-like inputs
      const textareas = await page.locator('textarea').count();
      const textInputs = await page.locator('input[type="text"]').count();
      const contentEditables = await page.locator('[contenteditable="true"]').count();

      console.log(`${route}: textarea=${textareas}, text inputs=${textInputs}, contenteditable=${contentEditables}`);

      if (textareas > 0 || contentEditables > 0) {
        await page.screenshot({ path: `/tmp/zoo-chat-found-${route.replace(/\//g, '_')}.png` });
        console.log(`✅ Found chat interface at ${route}!`);
      }
    }
  });

  test('should check for model/engine selection UI', async ({ page }) => {
    const routes = ['/', '/add-ai', '/settings', '/chat'];

    for (const route of routes) {
      await page.goto(`http://localhost:1420${route}`);
      await page.waitForLoadState('networkidle');

      // Look for LM Studio
      const lmStudio = await page.locator('text=/LM Studio/i').count();
      const ollama = await page.locator('text=/Ollama/i').count();
      const openai = await page.locator('text=/OpenAI/i').count();
      const zooBackend = await page.locator('text=/Zoo Backend|Hanzo/i').count();

      if (lmStudio > 0 || ollama > 0 || openai > 0 || zooBackend > 0) {
        console.log(`${route}: LM Studio=${lmStudio}, Ollama=${ollama}, OpenAI=${openai}, Zoo Backend=${zooBackend}`);
        await page.screenshot({ path: `/tmp/zoo-engines-${route.replace(/\//g, '_')}.png` });
        console.log(`✅ Found engine UI at ${route}!`);
      }
    }
  });
});
