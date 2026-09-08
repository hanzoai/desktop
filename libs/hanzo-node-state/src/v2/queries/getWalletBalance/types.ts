import { type Token } from '@hanzo/desktop-message-ts/api/general/types';
import { type GetWalletBalanceResponse } from '@hanzo/desktop-message-ts/api/wallets';

export type GetWalletBalanceInput = Token & {
  nodeAddress: string;
};

export type GetWalletBalanceOutput = GetWalletBalanceResponse;
