import { type Token } from '@hanzo_network/hanzo-message-ts/api/general/types';
import { type GetToolsResponse } from '@hanzo_network/hanzo-message-ts/api/tools/types';

export type GetSearchToolsInput = Token & {
  nodeAddress: string;
  search: string;
};

export type GetSearchToolsOutput = GetToolsResponse;
