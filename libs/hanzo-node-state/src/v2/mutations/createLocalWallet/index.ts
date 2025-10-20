import { createLocalWallet as createLocalWalletApi } from '@hanzo_network/hanzo-message-ts/api/wallets';

import { type CreateLocalWalletInput } from './types';

export const createLocalWallet = async ({
  nodeAddress,
  token,
  network,
  role,
}: CreateLocalWalletInput) => {
  const data = await createLocalWalletApi(nodeAddress, token, {
    network: network,
    role: role,
  });
  return data;
};
