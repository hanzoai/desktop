import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';

/**
 * End-to-end verification of the Hanzo Desktop local + production stack:
 *   1. Local hanzod backend (127.0.0.1:3690): capabilities, security boundaries,
 *      identity, Rust-native Dev session lifecycle, model catalog, embedded chain.
 *   2. Local private AI (hanzo-router :1235 / hanzo-engine :1234): health & models.
 *   3. Production product paths: OIDC discovery, api.hanzo.ai (/health, /v1/dev/health,
 *      /v1/billing/plans, /v1/sources*), and flagship web surfaces (hanzo.ai, hanzo.app,
 *      hanzo.team, hanzo.bot).
 *
 * Local daemon & production network checks skip cleanly when unavailable so CI
 * builds without a local daemon or outbound internet never flake.
 */

const HANZOD_URL = process.env.HANZOD_URL || 'http://127.0.0.1:3690';
const ROUTER_URL = process.env.HANZO_ROUTER_URL || 'http://127.0.0.1:1235';
const ENGINE_URL = process.env.HANZO_ENGINE_URL || 'http://127.0.0.1:1234';
const API_URL = process.env.HANZO_API_URL || 'https://api.hanzo.ai';
const OIDC_URL =
  process.env.HANZO_OIDC_URL || 'https://hanzo.ai/.well-known/openid-configuration';

function resolveBearer(): string | null {
  const fromEnv = process.env.HANZO_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  try {
    const out = execFileSync('hanzo', ['auth', 'token'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 10_000,
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

test.describe('hanzod local desktop backend E2E', () => {
  test('capabilities, routes, and native Dev health', async ({ request }) => {
    const healthz = await request.get(`${HANZOD_URL}/healthz`).catch(() => null);
    test.skip(!healthz || !healthz.ok(), `hanzod not reachable at ${HANZOD_URL}`);

    const infoRes = await request.get(`${HANZOD_URL}/v1/hanzod`);
    expect(infoRes.status()).toBe(200);
    const info = await infoRes.json();
    expect(info.name).toBe('hanzod');
    expect(info.capabilities?.dev).toBe('rust-native');
    expect(info.capabilities?.engine).toBe('managed');
    expect(info.capabilities?.zap).toBe(true);

    const prefixes = (info.routes as Array<{ prefix: string }>).map((r) => r.prefix);
    expect(prefixes).toEqual(
      expect.arrayContaining(['/v1/hanzod', '/v1/identity', '/v1/dev', '/v1/engine/catalog', '/v1/chain']),
    );

    const devHealthRes = await request.get(`${HANZOD_URL}/v1/dev/health`);
    expect(devHealthRes.status()).toBe(200);
    const devHealth = await devHealthRes.json();
    expect(devHealth.ok).toBe(true);
    expect(devHealth.runtime).toBe('rust-native');
  });

  test('enforces bearer auth and rejects cross-origin requests', async ({ request }) => {
    const healthz = await request.get(`${HANZOD_URL}/healthz`).catch(() => null);
    test.skip(!healthz || !healthz.ok(), `hanzod not reachable at ${HANZOD_URL}`);

    const unauth = await request.get(`${HANZOD_URL}/v1/identity`);
    expect(unauth.status()).toBe(401);

    const badOrigin = await request.get(`${HANZOD_URL}/v1/hanzod`, {
      headers: { Origin: 'https://evil.example' },
    });
    expect(badOrigin.status()).toBe(403);
  });

  test('authenticated identity, engine catalog, embedded chain, and Dev session lifecycle', async ({
    request,
  }) => {
    const healthz = await request.get(`${HANZOD_URL}/healthz`).catch(() => null);
    test.skip(!healthz || !healthz.ok(), `hanzod not reachable at ${HANZOD_URL}`);

    const token = resolveBearer();
    test.skip(!token, 'no active Hanzo IAM token (sign in with `hanzo auth login`)');
    const headers = { Authorization: `Bearer ${token}` };

    const idRes = await request.get(`${HANZOD_URL}/v1/identity`, { headers });
    expect(idRes.status()).toBe(200);
    const identity = await idRes.json();
    expect(identity.active).toBe(true);
    expect(identity.owner).toBeTruthy();
    expect(identity.name).toBeTruthy();

    const catRes = await request.get(`${HANZOD_URL}/v1/engine/catalog`, { headers });
    expect(catRes.status()).toBe(200);
    const catalog = await catRes.json();
    expect(catalog.memory_bytes).toBeGreaterThan(0);
    expect(Array.isArray(catalog.models)).toBe(true);
    expect(catalog.models.length).toBeGreaterThan(0);

    const chainRes = await request.get(`${HANZOD_URL}/v1/chain`, { headers });
    expect(chainRes.status()).toBe(200);
    const chain = await chainRes.json();
    expect(chain.embedded).toBe(true);

    // Local Rust-native Dev session create -> list -> get -> delete.
    const createRes = await request.post(`${HANZOD_URL}/v1/dev/sessions`, {
      headers,
      data: { label: 'hanzod-e2e-smoke' },
    });
    const created = await createRes.json().catch(() => ({}));
    const sid = (created as { id?: string }).id;
    try {
      expect(createRes.status()).toBe(201);
      expect(sid).toBeTruthy();

      const listRes = await request.get(`${HANZOD_URL}/v1/dev/sessions`, { headers });
      expect(listRes.status()).toBe(200);
      const list = await listRes.json();
      expect((list.sessions as Array<{ id: string }>).some((s) => s.id === sid)).toBe(true);

      const getRes = await request.get(`${HANZOD_URL}/v1/dev/sessions/${sid}`, { headers });
      expect(getRes.status()).toBe(200);
    } finally {
      if (sid) {
        const delRes = await request.delete(`${HANZOD_URL}/v1/dev/sessions/${sid}`, { headers });
        expect(delRes.status()).toBe(200);
      }
    }
  });
});

test.describe('local private AI (hanzo-router / hanzo-engine) E2E', () => {
  test('serves OpenAI-compatible health and model catalog locally', async ({ request }) => {
    const routerHealth = await request.get(`${ROUTER_URL}/health`).catch(() => null);
    const engineHealth = await request.get(`${ENGINE_URL}/health`).catch(() => null);
    const base = routerHealth?.ok() ? ROUTER_URL : engineHealth?.ok() ? ENGINE_URL : null;
    test.skip(!base, `neither hanzo-router (${ROUTER_URL}) nor hanzo-engine (${ENGINE_URL}) is running`);

    const modelsRes = await request.get(`${base}/v1/models`);
    expect(modelsRes.status()).toBe(200);
    const models = await modelsRes.json();
    expect(Array.isArray(models.data)).toBe(true);
    expect(models.data.length).toBeGreaterThan(0);
  });
});

test.describe('production common product paths E2E', () => {
  test('OIDC discovery, core cloud APIs, and flagship web apps answer', async ({ request }) => {
    const oidcRes = await request.get(OIDC_URL).catch(() => null);
    test.skip(!oidcRes, 'no outbound network access to production');
    expect(oidcRes!.status()).toBe(200);
    const oidc = await oidcRes!.json();
    expect(oidc.issuer).toBeTruthy();
    expect(oidc.jwks_uri).toMatch(/^https:\/\//);

    for (const path of ['/health', '/v1/dev/health']) {
      const res = await request.get(`${API_URL}${path}`);
      expect(res.status(), `${API_URL}${path}`).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('ok');
    }

    const plansRes = await request.get(`${API_URL}/v1/billing/plans`);
    expect(plansRes.status()).toBe(200);
    const plans = await plansRes.json();
    expect(Array.isArray(plans)).toBe(true);
    expect(plans.some((p: { slug?: string }) => p.slug === 'free')).toBe(true);

    for (const site of ['https://hanzo.ai', 'https://hanzo.app', 'https://hanzo.team', 'https://hanzo.bot']) {
      const res = await request.get(site);
      expect(res.status(), site).toBeLessThan(400);
    }

    const token = resolveBearer();
    if (token) {
      const headers = { Authorization: `Bearer ${token}` };
      for (const path of ['/v1/sources', '/v1/sources/accounts', '/v1/sources/usage?by=provider']) {
        const res = await request.get(`${API_URL}${path}`, { headers });
        expect(res.status(), `${API_URL}${path}`).toBe(200);
      }
    }
  });
});
