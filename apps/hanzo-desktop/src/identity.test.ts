import { IAM } from '@hanzo/iam';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { adopt, SESSION, share } from './identity';
import { keychain } from './keychain';

const jwt = (claims: object) => {
  const e = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${e({ alg: 'none' })}.${e(claims)}.sig`;
};

beforeEach(() => keychain.clear());

describe('adopting the identity the shared store holds', () => {
  it('signs the window in: the access token and its absolute expiry, in milliseconds', async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const access = jwt({ owner: 'hanzo', name: 'z', exp });
    expect(await adopt(async () => ({ access_token: access }))).toBe(true);
    expect(keychain.getItem(SESSION.access)).toBe(access);
    expect(keychain.getItem(SESSION.expires)).toBe(String(exp * 1000));
    const sdk = new IAM({ serverUrl: 'https://iam.test', clientId: 'hanzo-app', redirectUri: 'http://127.0.0.1/callback', storage: keychain });
    expect(sdk.getAccessToken()).toBe(access);
    expect(sdk.isTokenExpired()).toBe(false);
  });

  it('survives the SDK ending the session it found spent', async () => {
    for (const k of Object.values(SESSION)) keychain.removeItem(k);
    const access = jwt({ exp: Math.floor(Date.now() / 1000) + 3600 });
    expect(await adopt(async () => ({ access_token: access }))).toBe(true);
    expect(keychain.getItem(SESSION.access)).toBe(access);
  });

  it('holds nothing when the store holds no identity', async () => {
    expect(await adopt(async () => null)).toBe(false);
    expect(keychain.length).toBe(0);
  });

  it('files a sign-in and keeps none of its refresh token', async () => {
    keychain.setItem(SESSION.access, jwt({ owner: 'hanzo', name: 'z' }));
    keychain.setItem(SESSION.refresh, 'rt');
    const file = vi.fn(async () => undefined);
    await share(file);
    expect(file).toHaveBeenCalledWith(expect.objectContaining({ refresh_token: 'rt' }));
    expect(keychain.getItem(SESSION.refresh)).toBeNull();
  });

  it('never touches the OS keychain: the session is memory and the shared vault only', async () => {
    const invoked: string[] = [];
    vi.doMock('@tauri-apps/api/core', () => ({ invoke: async (c: string) => void invoked.push(c) }));
    await adopt(async () => ({ access_token: jwt({ exp: 1 }) }));
    expect(invoked.filter((c) => c.includes('secure_storage'))).toEqual([]);
  });
});
