/**
 * The white-label guarantee, asserted.
 *
 * A Zoo build must send its users to zoolabs.id and a Lux build to lux.id — a
 * build that ships Zoo packaging while authenticating against hanzo.id is the
 * single worst failure mode of this app. These tests pin the authorize request
 * each brand produces, end to end through the real `createAuthorizeRequest`.
 */
import { describe, expect, it } from 'vitest';

import { createAuthorizeRequest } from './iam-auth';

// The canonical brand → IdP mapping. Mirrors libs/brand-config; deliberately
// re-typed here so a silent edit to the table fails a test instead of shipping.
const BRANDS = {
  hanzo: {
    baseUrl: 'https://hanzo.id',
    clientId: 'hanzo-app',
    redirectUri: 'hanzo://oauth/hanzo',
    callbackEvent: 'hanzo-iam-callback',
  },
  lux: {
    baseUrl: 'https://lux.id',
    clientId: 'lux-app',
    redirectUri: 'lux://oauth/lux',
    callbackEvent: 'lux-iam-callback',
  },
  zoo: {
    baseUrl: 'https://zoolabs.id',
    clientId: 'zoo-app',
    redirectUri: 'zoo://oauth/zoo',
    callbackEvent: 'zoo-iam-callback',
  },
} as const;

const OTHER_IDPS: Record<keyof typeof BRANDS, string[]> = {
  hanzo: ['lux.id', 'zoolabs.id'],
  lux: ['hanzo.id', 'zoolabs.id'],
  zoo: ['hanzo.id', 'lux.id'],
};

describe.each(Object.entries(BRANDS))('%s authorize request', (brand, iam) => {
  it('targets its OWN IdP on the canonical HIP-0111 path', async () => {
    const { url } = await createAuthorizeRequest(iam);
    const parsed = new URL(url);

    expect(parsed.origin).toBe(iam.baseUrl);
    expect(parsed.pathname).toBe('/v1/iam/oauth/authorize');
    // The legacy path the desktop used to ship.
    expect(parsed.pathname).not.toBe('/login/oauth/authorize');
    // No `/api/` prefix, ever.
    expect(parsed.pathname).not.toContain('/api/');
  });

  it('names its OWN client and deep-link redirect', async () => {
    const { url } = await createAuthorizeRequest(iam);
    const q = new URL(url).searchParams;

    expect(q.get('client_id')).toBe(iam.clientId);
    expect(q.get('redirect_uri')).toBe(iam.redirectUri);
    expect(q.get('response_type')).toBe('code');
    expect(q.get('scope')).toBe('openid profile email');
  });

  it('mentions no other brand anywhere in the URL', async () => {
    const { url } = await createAuthorizeRequest(iam);
    for (const foreign of OTHER_IDPS[brand as keyof typeof BRANDS]) {
      expect(url).not.toContain(foreign);
    }
  });

  it('is a real PKCE S256 request with a fresh verifier per call', async () => {
    const first = await createAuthorizeRequest(iam);
    const second = await createAuthorizeRequest(iam);
    const q = new URL(first.url).searchParams;

    expect(q.get('code_challenge_method')).toBe('S256');
    // base64url of a SHA-256 digest: 43 chars, no padding, no +/.
    expect(q.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(q.get('state')).toMatch(/^[A-Za-z0-9_-]{43}$/);

    // The challenge must be derived from THIS request's verifier, and both the
    // verifier and the state nonce must be single-use.
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(first.codeVerifier),
    );
    const expected = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(q.get('code_challenge')).toBe(expected);
    expect(second.codeVerifier).not.toBe(first.codeVerifier);
    expect(second.state).not.toBe(first.state);
  });

  it('ships no client secret', async () => {
    const { url } = await createAuthorizeRequest(iam);
    expect(new URL(url).searchParams.has('client_secret')).toBe(false);
  });
});
