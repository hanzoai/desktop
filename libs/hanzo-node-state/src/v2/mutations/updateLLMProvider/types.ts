import { type Token } from '@hanzo_network/hanzo-message-ts/api/general/types';
import {
  type SerializedLLMProvider,
  type UpdateLLMProviderResponse,
} from '@hanzo_network/hanzo-message-ts/api/jobs/types';

export type UpdateLLMProviderInput = Token & {
  nodeAddress: string;
  agent: SerializedLLMProvider;
};
export type UpdateLLMProviderOutput = UpdateLLMProviderResponse;
