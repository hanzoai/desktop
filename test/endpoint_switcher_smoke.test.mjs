import test from 'node:test'
import assert from 'node:assert/strict'

// Mock browser localStorage for Node test runner
const mockStorage = new Map()
globalThis.window = {
  localStorage: {
    getItem: (key) => mockStorage.get(key) || null,
    setItem: (key, val) => mockStorage.set(key, String(val)),
    removeItem: (key) => mockStorage.delete(key),
    clear: () => mockStorage.clear()
  }
}

import {
  getEndpointConfig,
  saveEndpointConfig,
  resetToLocalDefaults,
  probeEndpoints,
  isLoopbackUrl,
  LOCAL_CLOUD_URL,
  LOCAL_ENGINE_URL,
  PROD_CLOUD_URL
} from '../libs/desktop-sdk/src/endpoint-manager.ts'

test('Endpoint Switcher - Defaults & Local Detection', () => {
  mockStorage.clear()
  const cfg = getEndpointConfig()

  assert.equal(cfg.cloudApi, LOCAL_CLOUD_URL)
  assert.equal(cfg.engineUrl, LOCAL_ENGINE_URL)
  assert.equal(cfg.isLocalOnly, true)

  assert.equal(isLoopbackUrl('http://127.0.0.1:8080'), true)
  assert.equal(isLoopbackUrl('http://localhost:1234'), true)
  assert.equal(isLoopbackUrl('https://api.hanzo.ai'), false)
})

test('Settings Persistence - Cloud API Switcher across restarts', () => {
  mockStorage.clear()

  // Switch to custom staging/cloud endpoint
  const updated = saveEndpointConfig({
    cloudApi: 'https://staging.hanzo.cloud',
    engineUrl: 'http://127.0.0.1:1234'
  })

  assert.equal(updated.cloudApi, 'https://staging.hanzo.cloud')
  assert.equal(updated.isLocalOnly, false)

  // Verify persistence in localStorage
  assert.ok(mockStorage.has('hanzo_desktop_endpoint_config'))

  // Re-read configuration (simulating app restart)
  const reloaded = getEndpointConfig()
  assert.equal(reloaded.cloudApi, 'https://staging.hanzo.cloud')
  assert.equal(reloaded.engineUrl, 'http://127.0.0.1:1234')
  assert.ok(reloaded.persistedAt)
})

test('Endpoint Switcher - Reset to Local Defaults (:8080 and :1234)', () => {
  // Reset back to offline defaults
  const reset = resetToLocalDefaults()
  assert.equal(reset.cloudApi, LOCAL_CLOUD_URL)
  assert.equal(reset.engineUrl, LOCAL_ENGINE_URL)
  assert.equal(reset.isLocalOnly, true)

  const check = getEndpointConfig()
  assert.equal(check.cloudApi, 'http://127.0.0.1:8080')
  assert.equal(check.engineUrl, 'http://127.0.0.1:1234')
  assert.equal(check.isLocalOnly, true)
})

test('Endpoint Prober - Graceful offline error handling', async () => {
  // Probe with unroutable local ports
  const result = await probeEndpoints({
    cloudApi: 'http://127.0.0.1:59998',
    engineUrl: 'http://127.0.0.1:59999'
  }, 100)

  // Must not throw, returns online flags gracefully
  assert.equal(typeof result.cloudOnline, 'boolean')
  assert.equal(typeof result.engineOnline, 'boolean')
})

test('No hardcoded api.hanzo.ai assumptions in offline mode', () => {
  const localConfig = getEndpointConfig()
  assert.doesNotMatch(localConfig.cloudApi, /api\.hanzo\.ai/)
  assert.doesNotMatch(localConfig.engineUrl, /api\.hanzo\.ai/)
})
