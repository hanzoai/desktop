/**
 * The desktop's keychain: @luxwallet/core's Tauri keychain bound to this app's
 * host bridge (macOS Keychain / Windows Credential Manager / libsecret via the
 * `secure_storage_*` commands). Outside Tauri it falls back to a session-only
 * in-memory map — secrets never hit disk in the clear either way.
 */
import { tauriKeychain } from '@luxwallet/core';
import { invoke } from '@tauri-apps/api/core';

import { isTauriAvailable } from '../../utils/tauri-check';

export const keychain = tauriKeychain({
  invoke: (cmd, args) => invoke(cmd, args),
  isAvailable: isTauriAvailable,
});
