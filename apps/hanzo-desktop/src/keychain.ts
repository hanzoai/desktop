import { secureStorage } from './lib/secure-storage';

// The IAM session's storage: the OS keychain, never localStorage.
//
// @hanzo/iam keeps its tokens in a `Storage`, which is synchronous, and the
// keychain is asynchronous. So the session is one keychain record read once
// before the app mounts (`open`), held in memory, and written back whole on
// every change. A bearer token never reaches the webview's localStorage.

const RECORD = 'iam-session';

const held = new Map<string, string>();
let writing: Promise<void> = Promise.resolve();

function save(): void {
  const blob = JSON.stringify(Object.fromEntries(held));
  writing = writing.then(async () => {
    if (held.size) await secureStorage.setItem(RECORD, blob);
    else await secureStorage.removeItem(RECORD);
  });
}

/** Resolves once every change so far is in the keychain. Await it before a reload. */
export const written = (): Promise<void> => writing;

/** Reads the keychain record into memory. Await it before mounting IamProvider. */
export async function open(): Promise<void> {
  const raw = await secureStorage.getItem(RECORD);
  if (!raw) return;
  try {
    for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, string>)) held.set(k, v);
  } catch {
    await secureStorage.removeItem(RECORD);
  }
}

export const keychain: Storage = {
  get length() {
    return held.size;
  },
  key: (i: number) => [...held.keys()][i] ?? null,
  getItem: (k: string) => held.get(k) ?? null,
  setItem: (k: string, v: string) => {
    held.set(k, String(v));
    save();
  },
  removeItem: (k: string) => {
    if (held.delete(k)) save();
  },
  clear: () => {
    held.clear();
    save();
  },
};
