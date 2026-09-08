import { type Token } from '@hanzo/desktop-message-ts/api/general/types';
import { type GetToolStoreDetailsResponse } from '@hanzo/desktop-message-ts/api/tools/types';

export type GetToolStoreDetailsInput = Token & {
  nodeAddress: string;
  toolRouterKey: string;
};

export type GetToolStoreDetailsOutput = GetToolStoreDetailsResponse;
