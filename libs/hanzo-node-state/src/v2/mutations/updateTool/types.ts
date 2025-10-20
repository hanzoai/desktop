import { type Token } from '@hanzo_network/hanzo-message-ts/api/general/types';
import {
  type HanzoTool,
  type HanzoToolType,
  type UpdateToolResponse,
} from '@hanzo_network/hanzo-message-ts/api/tools/types';

export type UpdateToolOutput = UpdateToolResponse;

export type UpdateToolInput = Token & {
  nodeAddress: string;
  toolKey: string;
  toolType: HanzoToolType;
  toolPayload: HanzoTool;
  isToolEnabled: boolean;
};
