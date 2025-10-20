import { removeAgent as removeAgentApi } from '@hanzo_network/hanzo-message-ts/api/agents/index';

import { type RemoveAgentInput } from './types';

export const removeAgent = async ({
  nodeAddress,
  token,
  agentId,
}: RemoveAgentInput) => {
  const data = await removeAgentApi(nodeAddress, token, {
    agent_id: agentId,
  });
  return data;
};
