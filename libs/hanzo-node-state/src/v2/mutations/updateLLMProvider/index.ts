import { updateLLMProvider as updateLLMProviderApi } from '@hanzo/desktop-message-ts/api/jobs/index';

import { type UpdateLLMProviderInput } from './types';

export const updateLLMProvider = async ({
  nodeAddress,
  token,
  agent,
}: UpdateLLMProviderInput) => {
  const data = await updateLLMProviderApi(nodeAddress, token, agent);
  return data;
};
