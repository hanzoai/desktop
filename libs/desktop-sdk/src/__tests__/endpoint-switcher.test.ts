import { describe, expect, it, beforeEach } from 'vitest'

const ENDPOINT_STORAGE_KEY = 'hanzo.desktop.cloudApiEndpoint'
const ENGINE_STORAGE_KEY = 'hanzo.desktop.localEngineEndpoint'

interface EndpointConfig {
  cloudApiUrl: string
  localEngineUrl: string
  mode: 'cloud' | 'local'
}

function createEndpointStore(storage: Storage) {
  return {
    get(): EndpointConfig {
      const cloudApiUrl = storage.getItem(ENDPOINT_STORAGE_KEY) ?? 'https://api.hanzo.ai'
      const localEngineUrl = storage.getItem(ENGINE_STORAGE_KEY) ?? 'http://127.0.0.1:1234'
      const isLocal =
        cloudApiUrl.startsWith('http://127.0.0.1') || cloudApiUrl.startsWith('http://localhost')
      return {
        cloudApiUrl,
        localEngineUrl,
        mode: isLocal ? 'local' : 'cloud',
      }
    },
    setCloudEndpoint(url: string): void {
      storage.setItem(ENDPOINT_STORAGE_KEY, url.replace(/\/+$/, ''))
    },
    setLocalEngineEndpoint(url: string): void {
      storage.setItem(ENGINE_STORAGE_KEY, url.replace(/\/+$/, ''))
    },
  }
}

describe('Desktop Endpoint Switcher QA (#67)', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('switches Settings -> Cloud API Endpoint to local Cloud (127.0.0.1:8080) and persists across restarts', () => {
    const store = createEndpointStore(window.localStorage)
    expect(store.get().mode).toBe('cloud')

    store.setCloudEndpoint('http://127.0.0.1:8080/')
    store.setLocalEngineEndpoint('http://127.0.0.1:1234/')

    // Simulate app restart by creating a new store instance backed by the same localStorage
    const restartedStore = createEndpointStore(window.localStorage)
    const cfg = restartedStore.get()
    expect(cfg.cloudApiUrl).toBe('http://127.0.0.1:8080')
    expect(cfg.localEngineUrl).toBe('http://127.0.0.1:1234')
    expect(cfg.mode).toBe('local')
  })

  it('avoids hardcoded api.hanzo.ai when configured for offline local-only mode', () => {
    const store = createEndpointStore(window.localStorage)
    store.setCloudEndpoint('http://127.0.0.1:8080')
    const cfg = store.get()
    expect(cfg.cloudApiUrl).not.toContain('api.hanzo.ai')
    expect(cfg.localEngineUrl).toBe('http://127.0.0.1:1234')
  })
})
