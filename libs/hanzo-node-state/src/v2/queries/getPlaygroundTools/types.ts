import { type Token } from '@hanzo_network/hanzo-message-ts/api/general/types';
import { type GetPlaygroundToolsResponse } from '@hanzo_network/hanzo-message-ts/api/tools/types';

export type GetPlaygroundToolsInput = Token & {
  nodeAddress: string;
};

export type GetPlaygroundToolsOutput = GetPlaygroundToolsResponse;
