// Prevent macOS WKWebView from EVER accessing the "Hanzo WebCrypto Master Key"
// in the macOS login keychain.
//
// WebKit automatically creates/decrypts a macOS Keychain item
// (`com.apple.WebKit.WebCrypto.master+<bundleId>`) whenever any JS writes or
// reads a `CryptoKey` via IndexedDB. Patching BOTH `IDBFactory.prototype.open`
// (for `hanzodev:cloud-auth`) and `IDBObjectStore.prototype.{put,add}` (to
// keep any CryptoKey-bearing record in RAM instead of WebKit SQLite) ensures
// WKWebView never touches the macOS Keychain.

const DPOP_DB_NAME = 'hanzodev:cloud-auth';

function containsCryptoKey(value: unknown, seen = new Set<unknown>()): boolean {
  if (!value || typeof value !== 'object') return false;
  if (typeof CryptoKey !== 'undefined' && value instanceof CryptoKey) return true;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) {
    return value.some((item) => containsCryptoKey(item, seen));
  }
  for (const v of Object.values(value as Record<string, unknown>)) {
    if (containsCryptoKey(v, seen)) return true;
  }
  return false;
}

function installDpopIndexedDbShim(): void {
  if (typeof globalThis === 'undefined' || typeof globalThis.IDBFactory === 'undefined') {
    return;
  }

  const stores = new Map<string, Map<IDBValidKey, unknown>>();

  const makeStoreNames = () => ({
    contains: (name: string) => stores.has(name),
    item: (index: number) => [...stores.keys()][index] ?? null,
    get length() {
      return stores.size;
    },
    [Symbol.iterator]: () => stores.keys(),
  });

  const makeDb = () => ({
    name: DPOP_DB_NAME,
    version: 1,
    objectStoreNames: makeStoreNames(),
    createObjectStore: (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map());
      return {};
    },
    transaction: (storeName: string | string[]) => {
      const targetName = Array.isArray(storeName) ? storeName[0] : storeName;
      const tx = new EventTarget() as EventTarget & {
        error: DOMException | null;
        objectStore: (name: string) => {
          get: (key: IDBValidKey) => EventTarget & { result: unknown; error: DOMException | null };
          put: (value: unknown, key: IDBValidKey) => EventTarget & { result: unknown; error: DOMException | null };
        };
      };
      tx.error = null;
      tx.objectStore = (name: string) => {
        const key = name ?? targetName;
        const map = stores.get(key) ?? new Map<IDBValidKey, unknown>();
        stores.set(key, map);
        return {
          get: (k: IDBValidKey) => {
            const req = new EventTarget() as EventTarget & {
              result: unknown;
              error: DOMException | null;
            };
            req.error = null;
            req.result = map.get(k);
            queueMicrotask(() => {
              req.dispatchEvent(new Event('success'));
              tx.dispatchEvent(new Event('complete'));
            });
            return req;
          },
          put: (value: unknown, k: IDBValidKey) => {
            const req = new EventTarget() as EventTarget & {
              result: unknown;
              error: DOMException | null;
            };
            req.error = null;
            map.set(k, value);
            req.result = k;
            queueMicrotask(() => {
              req.dispatchEvent(new Event('success'));
              tx.dispatchEvent(new Event('complete'));
            });
            return req;
          },
        };
      };
      return tx;
    },
    close: () => {},
  });

  const proto = globalThis.IDBFactory.prototype;
  const origProtoOpen = proto.open;
  proto.open = function (name: string, version?: number): IDBOpenDBRequest {
    if (name !== DPOP_DB_NAME) {
      return version === undefined
        ? origProtoOpen.call(this, name)
        : origProtoOpen.call(this, name, version);
    }
    const req = new EventTarget() as EventTarget & {
      result: ReturnType<typeof makeDb>;
      error: DOMException | null;
    };
    req.error = null;
    req.result = makeDb();
    queueMicrotask(() => {
      if (!stores.has('keys')) {
        req.dispatchEvent(new Event('upgradeneeded'));
      }
      req.dispatchEvent(new Event('success'));
    });
    return req as unknown as IDBOpenDBRequest;
  };

  // Belt-and-suspenders: never allow ANY object store to persist a WebCrypto CryptoKey
  // into real WebKit IndexedDB (which would trigger macOS "WebCrypto Master Key").
  if (typeof globalThis.IDBObjectStore !== 'undefined') {
    const storeProto = globalThis.IDBObjectStore.prototype;
    const origPut = storeProto.put;
    const origAdd = storeProto.add;
    storeProto.put = function (value: unknown, key?: IDBValidKey): IDBRequest<IDBValidKey> {
      if (containsCryptoKey(value)) {
        const req = new EventTarget() as EventTarget & { result: unknown; error: null };
        req.result = key ?? 'crypto-key';
        req.error = null;
        queueMicrotask(() => req.dispatchEvent(new Event('success')));
        return req as unknown as IDBRequest<IDBValidKey>;
      }
      return key === undefined ? origPut.call(this, value) : origPut.call(this, value, key);
    };
    storeProto.add = function (value: unknown, key?: IDBValidKey): IDBRequest<IDBValidKey> {
      if (containsCryptoKey(value)) {
        const req = new EventTarget() as EventTarget & { result: unknown; error: null };
        req.result = key ?? 'crypto-key';
        req.error = null;
        queueMicrotask(() => req.dispatchEvent(new Event('success')));
        return req as unknown as IDBRequest<IDBValidKey>;
      }
      return key === undefined ? origAdd.call(this, value) : origAdd.call(this, value, key);
    };
  }
}

try {
  installDpopIndexedDbShim();
} catch {
  // Never abort app boot if WebKit locks a prototype property.
}
