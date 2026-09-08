import { type Token } from '@hanzo/desktop-message-ts/api/general/types';
import { type CreatePromptResponse } from '@hanzo/desktop-message-ts/api/tools/types';

export type CreatePromptOutput = CreatePromptResponse;

export type CreatePromptInput = Token & {
  nodeAddress: string;
  promptName: string;
  promptContent: string;
};
