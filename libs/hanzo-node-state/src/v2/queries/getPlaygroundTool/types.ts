import { type Token } from '@hanzo_network/hanzo-message-ts/api/general/types';
import { type GetPlaygroundToolResponse } from '@hanzo_network/hanzo-message-ts/api/tools/types';

export type GetPlaygroundToolInput = Token & {
  nodeAddress: string;
  toolRouterKey: string;
  xHanzoOriginalToolRouterKey?: string;
};

export type GetPlaygroundToolOutput = GetPlaygroundToolResponse;
