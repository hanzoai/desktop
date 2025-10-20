import { type Token } from '@hanzo_network/hanzo-message-ts/api/general/types';
import { type GetWalletListResponse } from '@hanzo_network/hanzo-message-ts/api/wallets';

export type GetWalletListInput = Token & {
  nodeAddress: string;
};

export type GetWalletListOutput = GetWalletListResponse;
