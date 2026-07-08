/**
 * Secret-at-rest storage for wallet material.
 *
 * Mnemonics and private keys NEVER touch the persisted app state (which is
 * plain localStorage). They live only in the OS keychain, reached through the
 * `secure_storage_*` Tauri commands (macOS Keychain / Windows Credential
 * Manager / libsecret). Outside Tauri (browser dev/tests) they stay in a
 * process-memory map for the session — still never written to disk in the
 * clear.
 */
import { isTauriAvailable, safeInvoke } from '../../utils/tauri-check';

const NS = 'luxwallet';
const memory = new Map<string, string>();

const mnemonicKey = (id: string) => `${NS}:${id}:mnemonic`;
const privateKeyKey = (id: string) => `${NS}:${id}:privateKey`;

async function put(key: string, value: string): Promise<void> {
  if (isTauriAvailable()) {
    await safeInvoke('secure_storage_set', { key, value });
  } else {
    memory.set(key, value);
  }
}

async function read(key: string): Promise<string | null> {
  if (isTauriAvailable()) {
    return safeInvoke<string>('secure_storage_get', { key });
  }
  return memory.get(key) ?? null;
}

async function drop(key: string): Promise<void> {
  if (isTauriAvailable()) {
    await safeInvoke('secure_storage_delete', { key });
  } else {
    memory.delete(key);
  }
}

/** Store an account's mnemonic + private key in the keychain. */
export async function sealSecrets(
  id: string,
  secrets: { mnemonic?: string; privateKey: string },
): Promise<void> {
  if (secrets.mnemonic) await put(mnemonicKey(id), secrets.mnemonic);
  await put(privateKeyKey(id), secrets.privateKey);
}

export function getMnemonic(id: string): Promise<string | null> {
  return read(mnemonicKey(id));
}

export function getPrivateKey(id: string): Promise<string | null> {
  return read(privateKeyKey(id));
}

/** Remove all secret material for an account. */
export async function dropSecrets(id: string): Promise<void> {
  await drop(mnemonicKey(id));
  await drop(privateKeyKey(id));
}
