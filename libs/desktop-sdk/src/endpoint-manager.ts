/**
 * Endpoint Switcher & Persistence Manager for Hanzo Desktop SDK
 * 
 * Supports seamless switching between local offline mode (hanzo up at :8080,
 * hanzo engine at :1234) and cloud production (api.hanzo.ai).
 * Persists user configuration across desktop restarts via localStorage / desktop settings.
 */

export interface DesktopEndpointConfig {
  cloudApi: string;
  engineUrl: string;
  isLocalOnly: boolean;
  persistedAt?: string;
}

export const LOCAL_CLOUD_URL = 'http://127.0.0.1:8080';
export const LOCAL_ENGINE_URL = 'http://127.0.0.1:1234';
export const PROD_CLOUD_URL = 'https://api.hanzo.ai';
export const PROD_ENGINE_URL = 'https://api.hanzo.ai';

const STORAGE_KEY = 'hanzo_desktop_endpoint_config';

/**
 * Normalizes URL string, stripping trailing slashes.
 */
export function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

/**
 * Checks if a given URL points to a local loopback interface.
 */
export function isLoopbackUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '::1' ||
      parsed.hostname.endsWith('.localhost')
    );
  } catch {
    return url.includes('127.0.0.1') || url.includes('localhost');
  }
}

/**
 * Returns current effective endpoints, checking localStorage -> import.meta.env -> defaults.
 */
export function getEndpointConfig(): DesktopEndpointConfig {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.cloudApi && parsed.engineUrl) {
          return {
            cloudApi: normalizeUrl(parsed.cloudApi),
            engineUrl: normalizeUrl(parsed.engineUrl),
            isLocalOnly: isLoopbackUrl(parsed.cloudApi) && isLoopbackUrl(parsed.engineUrl),
            persistedAt: parsed.persistedAt,
          };
        }
      }
    } catch {
      // Ignore parse/storage errors
    }
  }

  // Check build-time or runtime environment
  const env =
    typeof import.meta !== 'undefined'
      ? (import.meta as ImportMeta & {
          env?: Record<string, string | undefined>;
        }).env
      : undefined;

  const envCloud = env?.['VITE_CLOUD_API'] || env?.['VITE_HANZO_API'];
  const envEngine = env?.['VITE_ENGINE_API'] || env?.['VITE_LOCAL_ENGINE_URL'];

  const cloudApi = normalizeUrl(envCloud || LOCAL_CLOUD_URL);
  const engineUrl = normalizeUrl(envEngine || LOCAL_ENGINE_URL);

  return {
    cloudApi,
    engineUrl,
    isLocalOnly: isLoopbackUrl(cloudApi) && isLoopbackUrl(engineUrl),
  };
}

/**
 * Persists endpoint configuration to localStorage.
 */
export function saveEndpointConfig(config: {
  cloudApi?: string;
  engineUrl?: string;
}): DesktopEndpointConfig {
  const current = getEndpointConfig();
  const nextCloud = normalizeUrl(config.cloudApi || current.cloudApi);
  const nextEngine = normalizeUrl(config.engineUrl || current.engineUrl);

  const updated: DesktopEndpointConfig = {
    cloudApi: nextCloud,
    engineUrl: nextEngine,
    isLocalOnly: isLoopbackUrl(nextCloud) && isLoopbackUrl(nextEngine),
    persistedAt: new Date().toISOString(),
  };

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // storage quota or disabled
    }
  }

  return updated;
}

/**
 * Resets endpoints to local defaults (hanzo up & hanzo engine).
 */
export function resetToLocalDefaults(): DesktopEndpointConfig {
  return saveEndpointConfig({
    cloudApi: LOCAL_CLOUD_URL,
    engineUrl: LOCAL_ENGINE_URL,
  });
}

/**
 * Checks reachability of both Cloud and Engine endpoints.
 */
export async function probeEndpoints(
  config = getEndpointConfig(),
  timeoutMs = 1500
): Promise<{ cloudOnline: boolean; engineOnline: boolean }> {
  const check = async (url: string, path: string): Promise<boolean> => {
    try {
      const res = await fetch(`${normalizeUrl(url)}${path}`, {
        signal: AbortSignal.timeout(timeoutMs),
      });
      return res.ok || res.status === 404; // reachable server
    } catch {
      return false;
    }
  };

  const [cloudOnline, engineOnline] = await Promise.all([
    check(config.cloudApi, '/health'),
    check(config.engineUrl, '/health'),
  ]);

  return { cloudOnline, engineOnline };
}
