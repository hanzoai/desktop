import { type Token } from '@hanzo/desktop-message-ts/api/general/types';
import { type GetToolsResponse } from '@hanzo/desktop-message-ts/api/tools/types';

export type GetSearchToolsInput = Token & {
  nodeAddress: string;
  search: string;
};

export type GetSearchToolsOutput = GetToolsResponse;
