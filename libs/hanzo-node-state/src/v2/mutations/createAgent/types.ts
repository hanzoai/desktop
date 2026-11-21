import {
  type Agent,
  type CreateAgentResponse,
} from '@hanzo_network/hanzo-message-ts/api/agents/types';
import { type Token } from '@hanzo_network/hanzo-message-ts/api/general/types';

export type CreateAgentOutput = CreateAgentResponse;

export type CreateAgentInput = Token & {
  nodeAddress: string;
  agent: Agent;
  cronExpression?: string;
};
