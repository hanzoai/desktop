import { getBrand } from '@hanzo/desktop-brand-config';
import { IAM, Unmatched } from '@hanzo/iam';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The desktop's sign-in, end to end but for the browser: the authorize request
// is made with the brand's redirect, and what comes back on that redirect (the
// loopback listener, src-tauri/src/loopback.rs) is exchanged against the state
// and PKCE verifier the request stored.
const { iam } = getBrand();

const store = () => {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  } as Storage;
};

const sdk = (storage: Storage) =>
  new IAM({
    serverUrl: 'https://iam.test',
    clientId: iam.clientId,
    redirectUri: iam.redirectUri,
    storage,
  });

afterEach(() => vi.unstubAllGlobals());

describe('desktop sign-in state round trip', () => {
  it('exchanges the code with the verifier its own request stored', async () => {
    const calls: URLSearchParams[] = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (String(url).includes('openid-configuration')) return new Response('{}', { status: 404 });
      calls.push(new URLSearchParams(String(init?.body)));
      return new Response(JSON.stringify({ access_token: 'a', token_type: 'Bearer', expires_in: 60 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    const client = sdk(store());
    const url = new URL(await client.getSigninUrl());
    expect(url.searchParams.get('redirect_uri')).toBe(iam.redirectUri);
    const back = new URL(iam.redirectUri);
    back.searchParams.set('code', 'c');
    back.searchParams.set('state', url.searchParams.get('state')!);
    await client.handleCallback(back.href);
    const body = calls.at(-1)!;
    expect(body.get('redirect_uri')).toBe(iam.redirectUri);
    expect(body.get('code_verifier')).toBeTruthy();
  });

  it('refuses a state this window never started', async () => {
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 404 }));
    const client = sdk(store());
    await client.getSigninUrl();
    const back = new URL(iam.redirectUri);
    back.searchParams.set('code', 'c');
    back.searchParams.set('state', 'another-browsers');
    await expect(client.handleCallback(back.href)).rejects.toBeInstanceOf(Unmatched);
  });
});
