import { type Token } from '@hanzo_network/hanzo-message-ts/api/general/types';
import { type GetAllPromptsResponse } from '@hanzo_network/hanzo-message-ts/api/tools/types';

export type GetPromptListInput = Token & {
  nodeAddress: string;
};

export type GetPromptListOutput = GetAllPromptsResponse;
