import { type Token } from '@hanzo/desktop-message-ts/api/general/types';
import { type DisableAllToolsResponse } from '@hanzo/desktop-message-ts/api/tools/types';

export type DisableAllToolsInput = Token & {
  nodeAddress: string;
};

export type DisableAllToolsOutput = DisableAllToolsResponse;
