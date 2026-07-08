/**
 * Sign-In-With-Wallet (SIWx / CAIP-122) against Hanzo/Lux/Zoo IAM.
 *
 * The one client-side login flow, mirroring the IAM SPA's canonical path
 * (iam/web/src/auth/WalletConnect.tsx) and HIP-0111:
 *
 *   1. GET  {iam}/v1/iam/web3/nonce?chain=evm&address=0x…  → LoginChallenge
 *   2. buildSiwxMessage(challenge, address)                → CAIP-122 string
 *   3. EIP-191 personal_sign of that string with @luxfi/crypto (keccak+secp256k1)
 *   4. POST {iam}/v1/iam/web3/verify {…proof}              → { userId } + session
 *
 * The SERVER mints the challenge; the CLIENT renders the exact message it
 * signs and returns it verbatim — the server re-parses that message and burns
 * the nonce. No browser round-trip, no wallet extension: the desktop signs
 * with its own local key.
 */
import { getBrand } from '@hanzo_network/brand-config';
import { buildSiwxMessage } from '@luxwallet/connect/caip122';
import type { LoginChallenge } from '@luxwallet/connect';

import { fromHex, getLuxCrypto, toHex } from './crypto';
import { getPrivateKey } from './keystore';

/** IAM's standard response envelope. */
interface IamEnvelope<T = unknown> {
  status: 'ok' | 'error';
  msg?: string;
  data?: T;
  data3?: unknown;
}

export interface SiwwResult {
  ok: boolean;
  userId?: string;
  address: string;
  reason?: string;
}

/** Concatenate byte arrays. */
function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/**
 * EIP-191 personal_sign over `message` with the account's secp256k1 key,
 * using the luxfi/crypto engine. Returns a 65-byte 0x-hex r‖s‖v signature with
 * v in {27,28} (IAM's verifier accepts 27/28 or 0/1).
 */
async function personalSign(
  privateKeyHex: string,
  message: string,
): Promise<string> {
  const lux = await getLuxCrypto();
  const msgBytes = new TextEncoder().encode(message);
  const prefix = new TextEncoder().encode(
    `Ethereum Signed Message:\n${msgBytes.length}`,
  );
  const digest = lux.keccak256(concatBytes(prefix, msgBytes));
  const sig = lux.secp256k1.sign(fromHex(privateKeyHex), digest);
  const out = new Uint8Array(65);
  out.set(sig.slice(0, 64));
  out[64] = sig[64] < 27 ? sig[64] + 27 : sig[64];
  return toHex(out);
}

/**
 * Run the full sign-in for an EVM `address` whose private key is in the
 * keychain under `accountId`. `organization`/`application` default to the
 * active brand (e.g. Hanzo → org "hanzo", app "app").
 */
export async function signInWithWallet(params: {
  accountId: string;
  address: string;
  organization?: string;
  application?: string;
  method?: 'signup' | 'login';
}): Promise<SiwwResult> {
  const brand = getBrand();
  const iam = brand.iam.baseUrl.replace(/\/+$/, '');
  const organization = params.organization ?? brand.brand;
  const application = params.application ?? 'app';
  const method = params.method ?? 'signup';
  const address = params.address;

  const pk = await getPrivateKey(params.accountId);
  if (!pk) {
    return { ok: false, address, reason: 'no signing key for this wallet' };
  }

  // 1. Nonce / challenge.
  const nonceUrl = `${iam}/v1/iam/web3/nonce?chain=evm&address=${encodeURIComponent(
    address,
  )}`;
  const nonceRes = await fetch(nonceUrl, {
    method: 'GET',
    credentials: 'include',
  });
  if (!nonceRes.ok) {
    return { ok: false, address, reason: `nonce HTTP ${nonceRes.status}` };
  }
  const nonceBody = (await nonceRes.json()) as IamEnvelope<LoginChallenge>;
  if (nonceBody.status !== 'ok' || !nonceBody.data) {
    return { ok: false, address, reason: nonceBody.msg ?? 'nonce rejected' };
  }
  const challenge = nonceBody.data;

  // 2. Render the CAIP-122 message and 3. sign it (EIP-191).
  const message = buildSiwxMessage({ challenge, address, chain: 'evm' });
  const signature = await personalSign(pk, message);

  // 4. Verify.
  const verifyRes = await fetch(`${iam}/v1/iam/web3/verify`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      organization,
      application,
      method,
      chain: 'evm',
      scheme: 'secp256k1-eip191',
      address,
      message,
      signature,
    }),
  });
  if (!verifyRes.ok) {
    return { ok: false, address, reason: `verify HTTP ${verifyRes.status}` };
  }
  const verifyBody = (await verifyRes.json()) as IamEnvelope<string>;
  if (verifyBody.status !== 'ok') {
    return { ok: false, address, reason: verifyBody.msg ?? 'verify rejected' };
  }
  return { ok: true, address, userId: verifyBody.data };
}
