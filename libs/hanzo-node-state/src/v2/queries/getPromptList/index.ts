import { getAllPrompts as getPromptListAPI } from '@hanzo_network/hanzo-message-ts/api/tools/index';

import { type GetPromptListInput } from './types';

export const getPromptList = async ({
  nodeAddress,
  token,
}: GetPromptListInput) => {
  const response = await getPromptListAPI(nodeAddress, token);
  return response;
};
