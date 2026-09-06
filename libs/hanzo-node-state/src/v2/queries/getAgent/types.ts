import { type GetAgentResponse } from '@hanzo/desktop-message-ts/api/agents/types';
import { type Token } from '@hanzo/desktop-message-ts/api/general/types';

export type GetAgentInput = Token & {
  nodeAddress: string;
  agentId: string;
};

export type GetAgentOutput = GetAgentResponse;
