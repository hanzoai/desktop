import { IAM } from '@hanzo/iam';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The keychain refuses to delete an entry that does not exist, as the real one
// does ("No matching entry found in secure storage").
const entries = new Map<string, string>();
vi.mock('./lib/secure-storage', () => ({
  secureStorage: {
    getItem: async (k: string) => entries.get(k) ?? null,
    setItem: async (k: string, v: string) => void entries.set(k, v),
    removeItem: async (k: string) => {
      if (!entries.delete(k)) throw new Error('No matching entry found in secure storage');
    },
  },
}));

import { adopt, SESSION, share } from './identity';
import { keychain, open, written } from './keychain';

const jwt = (claims: object) => {
  const e = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${e({ alg: 'none' })}.${e(claims)}.sig`;
};
const record = () => JSON.parse(entries.get('iam-session') ?? '{}') as Record<string, string>;

beforeEach(() => {
  entries.clear();
  keychain.clear();
});

describe('adopting the identity the shared store holds', () => {
  it('signs the window in: the access token and its absolute expiry, in milliseconds', async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const access = jwt({ owner: 'hanzo', name: 'z', exp });
    expect(await adopt(async () => ({ access_token: access }))).toBe(true);
    expect(record()[SESSION.access]).toBe(access);
    expect(record()[SESSION.expires]).toBe(String(exp * 1000));
    const sdk = new IAM({ serverUrl: 'https://iam.test', clientId: 'hanzo-app', redirectUri: 'http://127.0.0.1/callback', storage: keychain });
    expect(sdk.getAccessToken()).toBe(access);
    expect(sdk.isTokenExpired()).toBe(false);
  });

  it('survives the SDK ending the session it found spent, whose delete the keychain refuses', async () => {
    // What @hanzo/iam does a minute before expiry with no refresh token to spend:
    // clear every key, on a keychain that holds nothing to delete.
    for (const k of Object.values(SESSION)) keychain.removeItem(k);
    await written();
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const access = jwt({ exp });
    expect(await adopt(async () => ({ access_token: access }))).toBe(true);
    expect(record()[SESSION.access]).toBe(access);
  });

  it('holds nothing when the store holds no identity', async () => {
    expect(await adopt(async () => null)).toBe(false);
    expect(entries.size).toBe(0);
  });

  it('files a sign-in and keeps none of its refresh token', async () => {
    keychain.setItem(SESSION.access, jwt({ owner: 'hanzo', name: 'z' }));
    keychain.setItem(SESSION.refresh, 'rt');
    const file = vi.fn(async () => undefined);
    await share(file);
    expect(file).toHaveBeenCalledWith(expect.objectContaining({ refresh_token: 'rt' }));
    await written();
    expect(record()[SESSION.refresh]).toBeUndefined();
    await open();
  });
});
