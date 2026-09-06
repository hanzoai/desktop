/**
 * The token storage path: OS keychain, never localStorage.
 *
 * This exercises the storage adapter and the auth store's persistence with a
 * stubbed Tauri bridge. It deliberately does NOT stand in for a real sign-in —
 * no IdP is contacted and no token is minted here; the record written below is
 * test data whose only purpose is to observe WHERE persistence lands.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }));

// The adapter routes to the keychain only inside Tauri; presence of
// __TAURI_INTERNALS__ is that signal (see utils/tauri-check).
(window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {};

const { secureStorage } = await import('./secure-storage');
const { useAuth } = await import('../store/auth');

const calls = (cmd: string) => invoke.mock.calls.filter(([c]) => c === cmd);

describe('secureStorage', () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue(null);
    localStorage.clear();
  });

  it('writes through the secure_storage_set command', async () => {
    await secureStorage.setItem('iam-tokens', '{"access_token":"x"}');
    expect(calls('secure_storage_set')).toEqual([
      ['secure_storage_set', { key: 'iam-tokens', value: '{"access_token":"x"}' }],
    ]);
  });

  it('reads through secure_storage_get', async () => {
    invoke.mockResolvedValue('{"access_token":"x"}');
    await expect(secureStorage.getItem('iam-tokens')).resolves.toBe('{"access_token":"x"}');
    expect(calls('secure_storage_get')).toEqual([['secure_storage_get', { key: 'iam-tokens' }]]);
  });

  it('treats a missing entry as absent, not as a failure', async () => {
    // What the Rust command actually returns when the keychain has no record.
    invoke.mockRejectedValue('Key not found');
    await expect(secureStorage.getItem('iam-tokens')).resolves.toBeNull();
  });

  it('deletes through secure_storage_delete', async () => {
    await secureStorage.removeItem('iam-tokens');
    expect(calls('secure_storage_delete')).toEqual([
      ['secure_storage_delete', { key: 'iam-tokens' }],
    ]);
  });

  it('never touches localStorage', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    await secureStorage.setItem('iam-tokens', 'secret');
    await secureStorage.getItem('iam-tokens');
    await secureStorage.removeItem('iam-tokens');
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });
});

describe('auth store persistence', () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue(null);
    localStorage.clear();
  });

  it('persists the record holding the API key and IAM tokens to the keychain', async () => {
    useAuth.getState().setAuth({
      profile: 'main',
      node_address: 'http://127.0.0.1:3690',
      hanzo_identity: '@@test.sep-hanzo',
      encryption_pk: 'pk',
      identity_pk: 'pk',
      api_v2_key: 'api-key',
      hanzo_token: 'access',
      hanzo_refresh_token: 'refresh',
    });

    // zustand's persist writes asynchronously through the storage adapter.
    await vi.waitFor(() => expect(calls('secure_storage_set').length).toBeGreaterThan(0));

    const [, args] = calls('secure_storage_set')[0] as [string, { key: string; value: string }];
    expect(args.key).toBe('auth');
    expect(args.value).toContain('api-key');
    expect(args.value).toContain('refresh');

    // And nothing landed in plaintext on disk.
    expect(localStorage.getItem('auth')).toBeNull();
  });
});
