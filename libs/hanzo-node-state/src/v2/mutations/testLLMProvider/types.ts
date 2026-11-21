import { type Token } from '@hanzo_network/hanzo-message-ts/api/general/types';
import {
  type AddLLMProviderResponse,
  type SerializedLLMProvider,
} from '@hanzo_network/hanzo-message-ts/api/jobs/types';

export type TestLLMProviderInput = Token & {
  nodeAddress: string;
  agent: SerializedLLMProvider;
};
export type TestLLMProviderOutput = AddLLMProviderResponse;
