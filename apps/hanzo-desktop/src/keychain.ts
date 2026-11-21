// The IAM session's storage, held in memory and nowhere else.
//
// @hanzo/iam keeps its tokens in a `Storage`. The one durable store of a sign-in is the
// shared credentials vault (src-tauri/src/identity.rs, the file the Hanzo CLI keeps its own
// in), so nothing is written to the OS keychain: a rebuilt app has no keychain item to be
// asked about. Each launch adopts the vault's identity into this map before the app mounts
// (identity.ts `adopt`).

const held = new Map<string, string>();

export const keychain: Storage = {
  get length() {
    return held.size;
  },
  key: (i: number) => [...held.keys()][i] ?? null,
  getItem: (k: string) => held.get(k) ?? null,
  setItem: (k: string, v: string) => {
    held.set(k, String(v));
  },
  removeItem: (k: string) => {
    held.delete(k);
  },
  clear: () => {
    held.clear();
  },
};
