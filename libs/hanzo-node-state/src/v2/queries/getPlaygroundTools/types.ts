import { type Token } from '@hanzo/desktop-message-ts/api/general/types';
import { type GetPlaygroundToolsResponse } from '@hanzo/desktop-message-ts/api/tools/types';

export type GetPlaygroundToolsInput = Token & {
  nodeAddress: string;
};

export type GetPlaygroundToolsOutput = GetPlaygroundToolsResponse;
