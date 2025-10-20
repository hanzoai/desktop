import { type Token } from '@hanzo_network/hanzo-message-ts/api/general/types';
import { type CreatePromptResponse } from '@hanzo_network/hanzo-message-ts/api/tools/types';

export type CreatePromptOutput = CreatePromptResponse;

export type CreatePromptInput = Token & {
  nodeAddress: string;
  promptName: string;
  promptContent: string;
};
