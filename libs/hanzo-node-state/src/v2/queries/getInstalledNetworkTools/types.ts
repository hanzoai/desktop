import { type Token } from '@hanzo_network/hanzo-message-ts/api/general/types';
import { type GetInstalledNetworkToolsResponse } from '@hanzo_network/hanzo-message-ts/api/tools/types';

export type GetInstalledNetworkToolsInput = Token & {
  nodeAddress: string;
};

export type GetInstalledNetworkToolsOutput = GetInstalledNetworkToolsResponse;
