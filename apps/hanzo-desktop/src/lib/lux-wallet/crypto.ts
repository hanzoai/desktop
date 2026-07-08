/**
 * The wallet's ONE crypto engine: luxfi/crypto compiled to WASM.
 *
 * This is the literal luxfi/crypto Go code (bit-identical to the on-chain Lux
 * precompiles) exposing REAL ML-DSA-65 (FIPS-204 PQ), secp256k1, keccak256/
 * sha3/shake, X-Wing KEM, and BIP-44 / service-identity key derivation. There
 * is no second crypto library in this wallet — key derivation, EVM tx signing,
 * and EIP-191 sign-in all go through this module.
 *
 * The WASM binary is loaded once (idempotent) and shared. In the Tauri webview
 * it resolves via `fetch` against the Vite-emitted asset URL.
 */
import init, { type LuxCrypto } from '@luxfi/crypto';
// Vite resolves the package's "./crypto.wasm" export to a hashed, served asset
// URL. `?url` keeps vite-plugin-wasm from trying to auto-instantiate the Go
// module (it needs the Go runtime's importObject, which init() provides).
import cryptoWasmUrl from '@luxfi/crypto/crypto.wasm?url';

let instance: Promise<LuxCrypto> | null = null;

/** Load (once) and return the luxfi/crypto WASM instance. */
export function getLuxCrypto(): Promise<LuxCrypto> {
  if (!instance) {
    instance = init(cryptoWasmUrl);
  }
  return instance;
}

/** True once the WASM core has finished loading. */
export async function ensureCryptoReady(): Promise<LuxCrypto> {
  return getLuxCrypto();
}

/** Lowercase 0x-hex of a byte array. */
export function toHex(bytes: Uint8Array): string {
  let s = '0x';
  for (let i = 0; i < bytes.length; i += 1) {
    s += bytes[i].toString(16).padStart(2, '0');
  }
  return s;
}

/** Parse 0x-hex (or bare hex) into bytes. */
export function fromHex(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
