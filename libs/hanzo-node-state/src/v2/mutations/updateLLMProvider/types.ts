import { type Token } from '@hanzo/desktop-message-ts/api/general/types';
import {
  type SerializedLLMProvider,
  type UpdateLLMProviderResponse,
} from '@hanzo/desktop-message-ts/api/jobs/types';

export type UpdateLLMProviderInput = Token & {
  nodeAddress: string;
  agent: SerializedLLMProvider;
};
export type UpdateLLMProviderOutput = UpdateLLMProviderResponse;
