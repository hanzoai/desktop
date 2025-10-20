import { setPreferences } from '@hanzo_network/hanzo-message-ts/api/general/index';

import { type SetMaxChatIterationsInput } from './types';

export const setMaxChatIterations = async ({
  nodeAddress,
  token,
  maxIterations,
}: SetMaxChatIterationsInput) => {
  const data = await setPreferences(nodeAddress, token, {
    max_iterations: maxIterations,
  });
  return data;
};
