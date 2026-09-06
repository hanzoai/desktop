import { type Token } from '@hanzo/desktop-message-ts/api/general/types';
import { type EnableAllToolsResponse } from '@hanzo/desktop-message-ts/api/tools/types';

export type EnableAllToolsInput = Token & {
  nodeAddress: string;
};

export type EnableAllToolsOutput = EnableAllToolsResponse;
