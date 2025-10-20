import { testLLMProvider as testLLMProviderApi } from '@hanzo_network/hanzo-message-ts/api/jobs/index';

import { type TestLLMProviderInput } from './types';

export const testLLMProvider = async ({
  nodeAddress,
  token,
  agent,
}: TestLLMProviderInput) => {
  const response = await testLLMProviderApi(nodeAddress, token, agent);
  return response;
};
