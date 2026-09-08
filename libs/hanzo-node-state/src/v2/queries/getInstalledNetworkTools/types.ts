import { type Token } from '@hanzo/desktop-message-ts/api/general/types';
import { type GetInstalledNetworkToolsResponse } from '@hanzo/desktop-message-ts/api/tools/types';

export type GetInstalledNetworkToolsInput = Token & {
  nodeAddress: string;
};

export type GetInstalledNetworkToolsOutput = GetInstalledNetworkToolsResponse;
