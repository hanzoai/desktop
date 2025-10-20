import { type Token } from '@hanzo_network/hanzo-message-ts/api/general/types';
import { type EnableAllToolsResponse } from '@hanzo_network/hanzo-message-ts/api/tools/types';

export type EnableAllToolsInput = Token & {
  nodeAddress: string;
};

export type EnableAllToolsOutput = EnableAllToolsResponse;
