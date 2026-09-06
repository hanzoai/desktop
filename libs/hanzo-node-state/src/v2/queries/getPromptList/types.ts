import { type Token } from '@hanzo/desktop-message-ts/api/general/types';
import { type GetAllPromptsResponse } from '@hanzo/desktop-message-ts/api/tools/types';

export type GetPromptListInput = Token & {
  nodeAddress: string;
};

export type GetPromptListOutput = GetAllPromptsResponse;
