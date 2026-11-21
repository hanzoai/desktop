import { invoke } from '@tauri-apps/api/core';

import { keychain, written } from './keychain';

// One local identity (src-tauri/src/identity.rs): a sign-in here is filed where
// the Hanzo CLI keeps its own, and one the CLI already holds signs this window in
// with no browser. The refresh token has one holder, that store, so the window
// keeps the access token alone and asks for a fresh one when it runs out.

/** The IAM tokens the window holds, in the keys @hanzo/iam keeps them under. */
export const SESSION = {
  access: 'hanzo_iam_access_token',
  refresh: 'hanzo_iam_refresh_token',
  id: 'hanzo_iam_id_token',
  expires: 'hanzo_iam_expires_at',
};

type Tokens = { access_token: string; refresh_token?: string; id_token?: string };

/** The token's own expiry, in the milliseconds @hanzo/iam stores. */
function expiry(jwt: string): number | null {
  try {
    const exp = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp;
    return typeof exp === 'number' ? exp * 1000 : null;
  } catch {
    return null;
  }
}

/** Sign this window in as the identity the shared store holds, refreshed. False when it holds none. */
export async function adopt(ask: () => Promise<Tokens | null> = () => invoke<Tokens | null>('identity_adopt')): Promise<boolean> {
  const held = await ask();
  if (!held) return false;
  keychain.setItem(SESSION.access, held.access_token);
  if (held.id_token) keychain.setItem(SESSION.id, held.id_token);
  const until = expiry(held.access_token);
  if (until !== null) keychain.setItem(SESSION.expires, String(until));
  await written();
  return true;
}

/** Hand what this window's sign-in returned to the shared identity, and keep none of its refresh token. */
export async function share(file: (tokens: Tokens) => Promise<unknown> = (tokens) => invoke('identity_file', { tokens })): Promise<void> {
  const access = keychain.getItem(SESSION.access);
  if (!access) return;
  await file({
    access_token: access,
    refresh_token: keychain.getItem(SESSION.refresh) ?? undefined,
    id_token: keychain.getItem(SESSION.id) ?? undefined,
  });
  keychain.removeItem(SESSION.refresh);
  await written();
}
