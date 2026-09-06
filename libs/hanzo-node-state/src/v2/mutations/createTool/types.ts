import { type Token } from '@hanzo/desktop-message-ts/api/general/types';
import {
  type HanzoTool,
  type HanzoToolType,
  type UpdateToolResponse,
} from '@hanzo/desktop-message-ts/api/tools/types';

export type CreateToolOutput = UpdateToolResponse;

export type CreateToolInput = Token & {
  nodeAddress: string;
  toolType: HanzoToolType;
  toolPayload: HanzoTool;
  isToolEnabled: boolean;
};
