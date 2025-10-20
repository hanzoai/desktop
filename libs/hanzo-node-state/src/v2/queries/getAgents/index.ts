import { getAgents as getAgentsApi } from '@hanzo_network/hanzo-message-ts/api/agents/index';

import  { type GetAgentsInput } from './types';

export const getAgents = async ({
  nodeAddress,
  token,
  categoryFilter,
}: GetAgentsInput) => {
  const result = await getAgentsApi(nodeAddress, token, categoryFilter);
  return result;
};
