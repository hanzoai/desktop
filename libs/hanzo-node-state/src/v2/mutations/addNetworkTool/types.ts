import { type Token } from '@hanzo_network/hanzo-message-ts/api/general/types';
import { type NetworkHanzoTool } from '@hanzo_network/hanzo-message-ts/api/tools/types';

export type AddNetworkToolInput = Token & {
  nodeAddress: string;
  networkTool: NetworkHanzoTool;
};
export type AddNetworkToolOutput = any;
