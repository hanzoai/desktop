import { type RemoveAgentResponse } from '@hanzo_network/hanzo-message-ts/api/agents/types';
import { type Token } from '@hanzo_network/hanzo-message-ts/api/general/types';

export type RemoveAgentInput = Token & {
  nodeAddress: string;
  agentId: string;
};
export type RemoveAgentOutput = RemoveAgentResponse;
