import { type Token } from '@hanzo/desktop-message-ts/api/general/types';
import { type GetToolPlaygroundMetadataResponse } from '@hanzo/desktop-message-ts/api/tools/types';

export type GetToolPlaygroundMetadataInput = Token & {
  nodeAddress: string;
  toolRouterKey: string;
};

export type GetToolPlaygroundMetadataOutput = GetToolPlaygroundMetadataResponse;
