import { type Token } from '@hanzo_network/hanzo-message-ts/api/general/types';
import { type GetWalletBalanceResponse } from '@hanzo_network/hanzo-message-ts/api/wallets';

export type GetWalletBalanceInput = Token & {
  nodeAddress: string;
};

export type GetWalletBalanceOutput = GetWalletBalanceResponse;
