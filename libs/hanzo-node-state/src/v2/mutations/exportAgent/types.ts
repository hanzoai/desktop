import { type Token } from '@hanzo/desktop-message-ts/api/general/types';

export type ExportAgentInput = Token & {
  nodeAddress: string;
  agentId: string;
};

export type ExportAgentOutput = Blob;
