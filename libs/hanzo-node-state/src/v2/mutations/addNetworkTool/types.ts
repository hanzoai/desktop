import { type Token } from '@hanzo/desktop-message-ts/api/general/types';
import { type NetworkHanzoTool } from '@hanzo/desktop-message-ts/api/tools/types';

export type AddNetworkToolInput = Token & {
  nodeAddress: string;
  networkTool: NetworkHanzoTool;
};
export type AddNetworkToolOutput = any;
