import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import { generateKeyPair } from 'curve25519-js';

// @noble/ed25519 ships no hashing — SHA-512 must be supplied or sign and
// getPublicKey throw in the WebKit webview, which has no crypto.subtle, and key
// generation fails with onboarding stalled and nothing said.
//
// It goes on `hashes`. The older spelling wrote it onto `etc`, which is frozen,
// so that line threw at module load and took the whole surface with it.
ed.hashes.sha512 = sha512;

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
  const privKey = ed.utils.randomSecretKey();
  const pubKey = await ed.getPublicKeyAsync(privKey);

  const my_identity_sk_string: string = toHexString(privKey);
  const my_identity_pk_string: string = toHexString(pubKey);

  return {
    my_identity_sk_string,
    my_identity_pk_string,
  };
};
