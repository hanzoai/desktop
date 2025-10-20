import { type Token } from '@hanzo_network/hanzo-message-ts/api/general/types';
import { type DisableAllToolsResponse } from '@hanzo_network/hanzo-message-ts/api/tools/types';

export type DisableAllToolsInput = Token & {
  nodeAddress: string;
};

export type DisableAllToolsOutput = DisableAllToolsResponse;
