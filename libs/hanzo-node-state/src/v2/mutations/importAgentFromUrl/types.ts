import { type Agent } from '@hanzo/desktop-message-ts/api/agents/types';
import { type Token } from '@hanzo/desktop-message-ts/api/general/types';

export type ImportAgentFromUrlInput = Token & {
  nodeAddress: string;
  url: string;
};

export type ImportAgentFromUrlOutput = Agent;
