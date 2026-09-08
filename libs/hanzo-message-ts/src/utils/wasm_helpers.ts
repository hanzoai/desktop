import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import { generateKeyPair } from 'curve25519-js';

// @noble/ed25519 v2 ships no hashing — a SHA-512 impl MUST be injected or
// getPublicKeyAsync/sign throw in the WebKit webview (no crypto.subtle). Without
// this, key generation fails and onboarding silently stalls.
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));
ed.etc.sha512Async = (...m) => Promise.resolve(sha512(ed.etc.concatBytes(...m)));

type HexString = string;

export function toHexString(byteArray: Uint8Array) {
  return Array.from(byteArray, function (byte) {
    return ('0' + (byte & 0xff).toString(16)).slice(-2);
  }).join('');
}

export const generateEncryptionKeys = async (
  seed: Uint8Array,
): Promise<{
  my_encryption_sk_string: HexString;
  my_encryption_pk_string: HexString;
}> => {
  const encryptionKeys = generateKeyPair(seed);
  const my_encryption_sk_string: string = toHexString(encryptionKeys.private);
  const my_encryption_pk_string: string = toHexString(encryptionKeys.public);

  return {
    my_encryption_sk_string,
    my_encryption_pk_string,
  };
};

export const generateSignatureKeys = async (): Promise<{
  my_identity_sk_string: HexString;
  my_identity_pk_string: HexString;
}> => {
  const privKey = ed.utils.randomPrivateKey();
  const pubKey = await ed.getPublicKeyAsync(privKey);

  const my_identity_sk_string: string = toHexString(privKey);
  const my_identity_pk_string: string = toHexString(pubKey);

  return {
    my_identity_sk_string,
    my_identity_pk_string,
  };
};
