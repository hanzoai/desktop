# @luxfi/crypto

The **literal `luxfi/crypto` Go code compiled to WebAssembly** — not a
TypeScript reimplementation.

The `.wasm` shipped in this package is `GOOS=js GOARCH=wasm go build` of
[`github.com/luxfi/crypto`](https://github.com/luxfi/crypto) +
[`cloudflare/circl`](https://github.com/cloudflare/circl). Every byte it
produces is **wire-identical to the Lux on-chain precompiles and verifiers** —
the same ML-DSA-65, secp256k1, keccak/sha3/shake, and X-Wing code that runs on
the chain, now callable from Node and the browser.

## Install

```sh
npm install @luxfi/crypto
```

## Usage

```ts
import { init } from "@luxfi/crypto";

const c = await init();          // loads + instantiates the wasm (idempotent)

// ML-DSA-65 (FIPS 204, NIST Level 3)
const { publicKey, secretKey } = c.mldsa65.keygen();
const sig = c.mldsa65.sign(secretKey, new TextEncoder().encode("hello"));
c.mldsa65.verify(publicKey, new TextEncoder().encode("hello"), sig); // true

// secp256k1 (Ethereum-compatible recoverable ECDSA)
const pub = c.secp256k1.getPublicKey(sk);            // 65-byte uncompressed
const s = c.secp256k1.sign(sk, digest32);            // 65-byte [R||S||V]
const rec = c.secp256k1.recover(digest32, s);        // == pub

// Hashes
c.keccak256(bytes);        // 32 bytes
c.sha3_256(bytes);         // 32 bytes (FIPS 202)
c.shake256(bytes, 64);     // arbitrary length

// X-Wing KEM (ML-KEM-768 + X25519), draft-connolly-cfrg-xwing-kem
const kp = c.xwing.keygen();                          // pk 1216 / sk 32
const { sharedSecret, ciphertext } = c.xwing.encapsulate(kp.publicKey);
c.xwing.decapsulate(kp.secretKey, ciphertext);        // == sharedSecret

// luxfi/keys derivation (BIP-39/BIP-32 over the same luxfi primitives)
c.keys.serviceIdentity(mnemonic, "hanzo/kms-operator"); // ML-DSA-65 NodeID
c.keys.deriveSecp256k1(mnemonic, 0, 0);                 // m/44'/60'/0'/0/0
```

### Browser

The wasm is auto-resolved next to the module in Node. In the browser, pass it
explicitly to avoid bundler resolution quirks:

```ts
await init(fetch(new URL("@luxfi/crypto/crypto.wasm", import.meta.url)));
```

`init()` also accepts a `BufferSource`, a `Response`/`Promise<Response>`, a
`URL`, or a filesystem path string.

## API surface

| Group | Methods |
|-------|---------|
| `mldsa65` | `keygen()`, `keygenFromSeed(seed32)`, `sign(sk, msg, ctx?, {deterministic?})`, `verify(pk, msg, sig, ctx?)` |
| `secp256k1` | `sign(sk, digest32)`, `recover(digest32, sig65)`, `getPublicKey(sk, compressed?)`, `verify(pk, digest32, sig64)` |
| hashes | `keccak256(data)`, `sha3_256(data)`, `shake256(data, outLen?)` |
| `xwing` | `keygen()`, `keygenFromSeed(seed32)`, `encapsulate(pk, seed?)`, `decapsulate(sk, ct)` |
| `keys` | `serviceIdentity(mnemonic, servicePath)`, `deriveSecp256k1(mnemonic, account?, index?)` |

All byte arguments and results are `Uint8Array`. Sizes: ML-DSA-65 pk 1952 / sk
4032 / sig 3309; X-Wing pk 1216 / sk 32 / ct 1120 / shared 32; secp256k1 sig 65.

## Why standard Go and not TinyGo

The binary is built with the **standard Go toolchain** (`GOOS=js GOARCH=wasm`),
not TinyGo. TinyGo cannot build the dependency graph: `luxfi/crypto/mldsa`
pulls in `luxfi/accel` (GPU dispatch) whose cgo `#cgo` build-constraint lines
are *"not implemented"* by TinyGo, and circl's ML-DSA/ML-KEM use stdlib paths
TinyGo's runtime does not fully support. Standard Go excludes the cgo paths
under `CGO_ENABLED=0` and falls back to the pure-Go circl implementation — the
same code the chain runs. The result is larger but **wire-identical**:

| Toolchain | Result |
|-----------|--------|
| TinyGo `-target=wasm` | ✗ fails (luxfi/accel cgo `#cgo` lines unsupported) |
| Go `GOOS=js GOARCH=wasm` | ✓ `crypto.wasm` ≈ 7.2 MB (2.33 MB gzipped) |

## License

SEE LICENSE IN [LICENSE](./LICENSE) — Lux Ecosystem License.
Pure-Go cryptography from `github.com/luxfi/crypto`, `cloudflare/circl`, and
`decred/dcrd/secp256k1`.
