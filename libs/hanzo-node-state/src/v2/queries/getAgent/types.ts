import { type GetAgentResponse } from '@hanzo_network/hanzo-message-ts/api/agents/types';
import { type Token } from '@hanzo_network/hanzo-message-ts/api/general/types';

export type GetAgentInput = Token & {
  nodeAddress: string;
  agentId: string;
};

export type GetAgentOutput = GetAgentResponse;
