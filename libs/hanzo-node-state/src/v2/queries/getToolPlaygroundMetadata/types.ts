import { type Token } from '@hanzo_network/hanzo-message-ts/api/general/types';
import { type GetToolPlaygroundMetadataResponse } from '@hanzo_network/hanzo-message-ts/api/tools/types';

export type GetToolPlaygroundMetadataInput = Token & {
  nodeAddress: string;
  toolRouterKey: string;
};

export type GetToolPlaygroundMetadataOutput = GetToolPlaygroundMetadataResponse;
