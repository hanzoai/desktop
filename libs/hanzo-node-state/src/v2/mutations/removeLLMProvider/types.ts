import { type Token } from '@hanzo/desktop-message-ts/api/general/types';
import { type UpdateLLMProviderResponse } from '@hanzo/desktop-message-ts/api/jobs/types';

export type RemoveLLMProviderInput = Token & {
  nodeAddress: string;
  llmProviderId: string;
};
export type RemoveLLMProviderOutput = UpdateLLMProviderResponse;
