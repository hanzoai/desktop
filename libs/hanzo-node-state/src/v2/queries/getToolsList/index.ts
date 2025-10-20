import { getTools as getToolsApi } from '@hanzo_network/hanzo-message-ts/api/tools/index';

import { type GetToolsListInput } from './types';

export const getTools = async ({
  nodeAddress,
  token,
  category,
}: GetToolsListInput) => {
  const response = await getToolsApi(nodeAddress, token, {
    category: category,
  });
  return response;
};
