import { type Token } from '@hanzo_network/hanzo-message-ts/api/general/types';
import { type GetToolStoreDetailsResponse } from '@hanzo_network/hanzo-message-ts/api/tools/types';

export type GetToolStoreDetailsInput = Token & {
  nodeAddress: string;
  toolRouterKey: string;
};

export type GetToolStoreDetailsOutput = GetToolStoreDetailsResponse;
