/**
 * Sign-In-With-Wallet for the desktop — a THIN brand wiring over
 * @luxwallet/core's `createSiww`. The full CAIP-122 / EIP-191 flow (nonce →
 * render → personal_sign → verify against IAM) lives once in core; this only
 * injects the active brand's IAM base URL + default org/app, and re-exports the
 * bound `signInWithWallet(params)` the crypto-wallet page calls.
 */
import { getBrand } from '@hanzo_network/brand-config';
import { createSiww } from '@luxwallet/core';

import { getLuxCrypto } from './crypto';
import { keychain } from './keychain';

const brand = getBrand();

export const signInWithWallet = createSiww({
  iamBaseUrl: brand.iam.baseUrl,
  crypto: getLuxCrypto,
  keychain,
  defaultOrganization: brand.brand,
  defaultApplication: 'app',
});

export type { SiwwResult, SiwwParams } from '@luxwallet/core';
