import { type Token } from '@hanzo/desktop-message-ts/api/general/types';
import { type GetWalletListResponse } from '@hanzo/desktop-message-ts/api/wallets';

export type GetWalletListInput = Token & {
  nodeAddress: string;
};

export type GetWalletListOutput = GetWalletListResponse;
