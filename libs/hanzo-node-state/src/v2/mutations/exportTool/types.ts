import { type Token } from '@hanzo/desktop-message-ts/api/general/types';
import { type ExportToolResponse } from '@hanzo/desktop-message-ts/api/tools/types';

export type ExportToolInput = Token & {
  nodeAddress: string;
  toolKey: string;
};

export type ExportToolOutput = ExportToolResponse;
