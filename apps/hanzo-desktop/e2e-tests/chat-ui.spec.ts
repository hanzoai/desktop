import { test, expect } from '@playwright/test';

test.describe('Zoo Desktop UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:1420');
    await page.waitForLoadState('networkidle');
  });

  test('should load the Zoo application', async ({ page }) => {
    // Check page title
    await expect(page).toHaveTitle(/Zoo/i);

    // Take screenshot for reference
    await page.screenshot({ path: '/tmp/zoo-home.png' });
    console.log('✅ Screenshot saved to /tmp/zoo-home.png');
  });

  test('should display navigation elements', async ({ page }) => {
    // Look for common nav elements
    const navElements = await page.locator('nav, [role="navigation"], header').count();
    expect(navElements).toBeGreaterThan(0);
  });

  test('should have interactive elements', async ({ page }) => {
    // Check for buttons
    const buttons = await page.locator('button').count();
    console.log(`Found ${buttons} buttons on page`);
    expect(buttons).toBeGreaterThan(0);

    // Check for input fields
    const inputs = await page.locator('input, textarea').count();
    console.log(`Found ${inputs} input fields on page`);
  });
});

test.describe('Chat Interface Detection', () => {
  test('should find chat-related elements', async ({ page }) => {
    await page.goto('http://localhost:1420');
    await page.waitForLoadState('networkidle');

    // Look for chat-related text
    const chatText = await page.locator('text=/chat|conversation|message|ai/i').count();
    console.log(`Found ${chatText} chat-related elements`);

    // Take full page screenshot
    await page.screenshot({ path: '/tmp/zoo-full-page.png', fullPage: true });
    console.log('✅ Full page screenshot saved to /tmp/zoo-full-page.png');
  });

  test('should identify input areas', async ({ page }) => {
    await page.goto('http://localhost:1420');
    await page.waitForLoadState('networkidle');

    // Find all text input areas
    const textInputs = await page.locator('input[type="text"], textarea, [contenteditable="true"]').all();
    console.log(`Found ${textInputs.length} text input areas`);

    if (textInputs.length > 0) {
      const firstInput = textInputs[0];
      const placeholderText = await firstInput.getAttribute('placeholder');
      console.log(`First input placeholder: ${placeholderText || 'none'}`);
    }
  });
});

test.describe('LLM Engine UI Elements', () => {
  test('should search for engine selection UI', async ({ page }) => {
    await page.goto('http://localhost:1420');
    await page.waitForLoadState('networkidle');

    // Search for model/engine related text
    const engineText = await page.locator('text=/model|engine|ollama|openai|studio|backend/i').all();
    console.log(`Found ${engineText.length} engine-related elements`);

    // Search for select dropdowns
    const selects = await page.locator('select, [role="combobox"], [role="listbox"]').all();
    console.log(`Found ${selects.length} dropdown selectors`);
  });

  test('should check for LM Studio in UI', async ({ page }) => {
    await page.goto('http://localhost:1420');
    await page.waitForLoadState('networkidle');

    // Look specifically for LM Studio
    const lmStudio = await page.locator('text=/LM Studio|lmstudio/i').count();
    console.log(`LM Studio mentions found: ${lmStudio}`);

    // Look for Ollama
    const ollama = await page.locator('text=/Ollama/i').count();
    console.log(`Ollama mentions found: ${ollama}`);
  });
});
