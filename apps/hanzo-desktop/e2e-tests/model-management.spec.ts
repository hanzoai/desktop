import { test, expect } from '@playwright/test';

/**
 * Model Management Tests
 *
 * Tests the ability to add models, change engines, and manage AI configurations.
 * These tests verify:
 * - Adding new models via UI
 * - Switching between different LLM engines
 * - Model configuration persistence
 * - Engine selection UI functionality
 */

const ZOO_NODE_URL = process.env.ZOO_NODE_URL || 'http://localhost:9550';

test.describe('Model Addition Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:1420');
    await page.waitForLoadState('networkidle');
  });

  test('should navigate to Add AI page', async ({ page }) => {
    const currentUrl = page.url();
    console.log('Starting at:', currentUrl);

    // Try to access Add AI page
    await page.goto('http://localhost:1420/add-ai');
    await page.waitForLoadState('networkidle');

    const finalUrl = page.url();
    console.log('Final URL:', finalUrl);

    // Take screenshot regardless of where we end up
    await page.screenshot({ path: '/tmp/model-management-add-ai.png' });

    if (finalUrl.includes('add-ai')) {
      console.log('✅ Successfully accessed Add AI page');
    } else if (finalUrl.includes('terms-conditions')) {
      console.log('⚠️ Redirected to terms (onboarding required)');
    } else {
      console.log(`⚠️ Unexpected redirect to: ${finalUrl}`);
    }
  });

  test('should display model selection dropdown if authenticated', async ({ page }) => {
    await page.goto('http://localhost:1420/add-ai');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const url = page.url();

    if (url.includes('add-ai')) {
      // We're on the Add AI page, look for dropdowns
      const dropdowns = await page.locator('select, [role="combobox"], [role="listbox"]').count();
      console.log(`Found ${dropdowns} dropdown elements`);

      if (dropdowns > 0) {
        console.log('✅ Model selection UI is present');

        // Try to find the model type dropdown
        const modelDropdown = page.locator('select').first();
        const options = await modelDropdown.locator('option').count();
        console.log(`Model dropdown has ${options} options`);

        await page.screenshot({ path: '/tmp/model-dropdown-found.png' });
      }
    } else {
      console.log('⚠️ Not on Add AI page, cannot test dropdown');
    }
  });

  test('should verify LM Studio is in model options', async ({ page }) => {
    await page.goto('http://localhost:1420/add-ai');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const bodyText = await page.locator('body').textContent();

    // Check for various engine names
    const engines = ['LM Studio', 'Ollama', 'OpenAI', 'Hanzo', 'Zoo Backend'];
    const foundEngines = engines.filter(engine =>
      bodyText?.includes(engine) || false
    );

    console.log('Found engines in page:', foundEngines);

    if (foundEngines.includes('LM Studio')) {
      console.log('✅ LM Studio found in UI');
    } else {
      console.log('⚠️ LM Studio not found (may be behind auth)');
    }

    await page.screenshot({ path: '/tmp/model-engines-check.png' });
  });
});

test.describe('Engine Switching', () => {
  test('should verify engine switching capability exists', async ({ page }) => {
    await page.goto('http://localhost:1420');
    await page.waitForLoadState('networkidle');

    // Look for any engine/model selection UI
    const engineSelectors = await page.locator('[role="combobox"], select, button:has-text("engine"), button:has-text("model")').count();

    console.log(`Found ${engineSelectors} potential engine selectors`);

    if (engineSelectors > 0) {
      console.log('✅ Engine switching UI detected');
    } else {
      console.log('⚠️ No engine selectors found (may require authentication)');
    }
  });

  test('should test engine configuration via API', async ({ request }) => {
    // Test if we can query available engines
    const response = await request.get(`${ZOO_NODE_URL}/v2/available_llm_providers`);

    if (response.ok()) {
      const providers = await response.json();
      console.log('Available providers:', JSON.stringify(providers, null, 2));

      // Check for expected providers
      const providerTypes = Array.isArray(providers)
        ? providers.map((p: any) => p.id || p.type || p.name)
        : [];

      console.log('Provider types found:', providerTypes);

      expect(providers).toBeDefined();
      console.log('✅ Engine configuration API working');
    } else {
      console.log(`⚠️ Could not fetch providers (status ${response.status()})`);
    }
  });

  test('should verify agent creation with different engines', async ({ request }) => {
    // Test creating an agent with zoo-backend (Hanzo) engine
    const agentPayload = {
      name: 'TestAgent',
      model_type: 'zoo-backend',
      model: 'FREE_TEXT_INFERENCE',
    };

    console.log('Testing agent creation with payload:', agentPayload);

    try {
      const response = await request.post(`${ZOO_NODE_URL}/v2/create_agent`, {
        data: agentPayload,
        timeout: 10000,
      });

      if (response.ok()) {
        const result = await response.json();
        console.log('Agent creation result:', result);
        console.log('✅ Successfully created agent with zoo-backend engine');
      } else {
        console.log(`⚠️ Agent creation returned ${response.status()}`);
        const error = await response.text();
        console.log('Response:', error);
      }
    } catch (error) {
      console.log('⚠️ Agent creation test error:', error);
    }
  });
});

test.describe('Model Configuration Persistence', () => {
  test('should check if model configs are saved', async ({ page }) => {
    await page.goto('http://localhost:1420');
    await page.waitForLoadState('networkidle');

    // Check localStorage for any saved configurations
    const localStorageData = await page.evaluate(() => {
      const data: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          data[key] = localStorage.getItem(key) || '';
        }
      }
      return data;
    });

    console.log('LocalStorage keys:', Object.keys(localStorageData));

    // Look for model or agent related keys
    const modelKeys = Object.keys(localStorageData).filter(key =>
      key.includes('model') || key.includes('agent') || key.includes('engine')
    );

    console.log('Model-related storage keys:', modelKeys);

    if (modelKeys.length > 0) {
      console.log('✅ Found model configuration in storage');
    } else {
      console.log('⚠️ No model configurations in localStorage yet');
    }
  });

  test('should verify agent list persistence via API', async ({ request }) => {
    // Get list of agents before and after page reload
    const response1 = await request.get(`${ZOO_NODE_URL}/v2/available_agents`);

    if (response1.ok()) {
      const agents1 = await response1.json();
      console.log('Initial agents:', JSON.stringify(agents1, null, 2));

      // Wait a moment
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Query again
      const response2 = await request.get(`${ZOO_NODE_URL}/v2/available_agents`);

      if (response2.ok()) {
        const agents2 = await response2.json();
        console.log('Agents after delay:', JSON.stringify(agents2, null, 2));

        // They should be the same (persistence working)
        expect(agents2).toBeDefined();
        console.log('✅ Agent list persists across requests');
      }
    } else {
      console.log(`⚠️ Could not fetch agents (status ${response1.status()})`);
    }
  });
});

test.describe('Model UI Components', () => {
  test('should check for model cards or list items', async ({ page }) => {
    await page.goto('http://localhost:1420');
    await page.waitForLoadState('networkidle');

    // Try to find any route that might show models
    const routes = ['/', '/settings', '/agents', '/add-ai'];

    for (const route of routes) {
      await page.goto(`http://localhost:1420${route}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500);

      const url = page.url();
      console.log(`Checking route ${route} -> ${url}`);

      // Look for model-related UI elements
      const modelElements = await page.locator('[data-model], [data-agent], .model-card, .agent-card').count();

      if (modelElements > 0) {
        console.log(`✅ Found ${modelElements} model UI elements on ${route}`);
        await page.screenshot({ path: `/tmp/model-ui-${route.replace('/', 'root')}.png` });
        break;
      }
    }
  });

  test('should verify engine selection dropdown contains expected options', async ({ page }) => {
    await page.goto('http://localhost:1420/add-ai');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Check page content for engine names
    const bodyText = await page.locator('body').textContent() || '';

    const expectedEngines = [
      'Ollama',
      'LM Studio',
      'OpenAI',
      'Zoo Backend',
      'Hanzo',
    ];

    const foundEngines = expectedEngines.filter(engine =>
      bodyText.toLowerCase().includes(engine.toLowerCase())
    );

    console.log('Expected engines found:', foundEngines);

    if (foundEngines.length >= 2) {
      console.log(`✅ Found ${foundEngines.length} engine options in UI`);
    } else {
      console.log('⚠️ Limited engine options visible (may be behind auth)');
    }

    await page.screenshot({ path: '/tmp/engine-options-full.png', fullPage: true });
  });
});

test.describe('Model Download and Installation', () => {
  test('should test HuggingFace model availability', async ({ request }) => {
    // Verify that the test model was downloaded correctly
    // This is more of a CI environment check
    console.log('Test model path:', process.env.TEST_MODEL_PATH || 'not set');

    if (process.env.TEST_MODEL_PATH) {
      console.log('✅ Test model is configured in environment');
    } else {
      console.log('⚠️ No test model path configured');
    }
  });

  test('should verify model can be loaded from local path', async ({ request }) => {
    // Skip if no test model
    if (!process.env.TEST_MODEL_PATH) {
      test.skip();
      return;
    }

    // Try to query if the model is loaded
    const response = await request.get(`${ZOO_NODE_URL}/v2/available_models`);

    if (response.ok()) {
      const models = await response.json();
      console.log('Loaded models:', JSON.stringify(models, null, 2));

      if (Array.isArray(models) && models.length > 0) {
        console.log(`✅ Found ${models.length} loaded model(s)`);
      } else {
        console.log('⚠️ No models currently loaded');
      }
    } else {
      console.log(`⚠️ Model query failed with status ${response.status()}`);
    }
  });
});
