import { type Token } from '@hanzo/desktop-message-ts/api/general/types';
import { type GetPlaygroundToolResponse } from '@hanzo/desktop-message-ts/api/tools/types';

export type GetPlaygroundToolInput = Token & {
  nodeAddress: string;
  toolRouterKey: string;
  xHanzoOriginalToolRouterKey?: string;
};

export type GetPlaygroundToolOutput = GetPlaygroundToolResponse;
