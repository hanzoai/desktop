import { publishAgent as publishAgentApi } from '@hanzo/desktop-message-ts/api/agents/index';
import type { PublishAgentResponse } from '@hanzo/desktop-message-ts/api/agents/types';

export type PublishAgentInput = {
  nodeAddress: string;
  token: string;
  agentId: string;
};

export const publishAgent = async ({
  nodeAddress,
  token,
  agentId,
}: PublishAgentInput): Promise<PublishAgentResponse> => {
  return publishAgentApi(nodeAddress, token, { agent_id: agentId });
};
