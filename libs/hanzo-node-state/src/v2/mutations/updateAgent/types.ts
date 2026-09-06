import {
  type Agent,
  type UpdateAgentResponse,
} from '@hanzo/desktop-message-ts/api/agents/types';
import { type Token } from '@hanzo/desktop-message-ts/api/general/types';

export type UpdateAgentOutput = UpdateAgentResponse;

export type UpdateAgentInput = Token & {
  nodeAddress: string;
  agent: Agent;
};
