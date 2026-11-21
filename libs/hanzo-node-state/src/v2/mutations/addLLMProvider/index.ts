import {
  addLLMProvider as addLLMProviderAPI,
  testLLMProvider,
} from '@hanzo_network/hanzo-message-ts/api/jobs/index';

import { type AddLLMProviderInput } from './types';

export const addLLMProvider = async ({
  nodeAddress,
  token,
  agent,
  enableTest,
}: AddLLMProviderInput) => {
  // The local engine variant (wire key `LocalEngine`, served by the local
  // OpenAI-compatible engine) is always reachable and needs no connectivity
  // test; every remote provider is tested before it is added.
  const isLocalEngineProvider = Boolean(agent.model.LocalEngine);
  if (!isLocalEngineProvider || enableTest) {
    await testLLMProvider(nodeAddress, token, agent);
  }
  const data = await addLLMProviderAPI(nodeAddress, token, agent);
  return data;
};
