import { Token } from '@hanzo_network/hanzo-message-ts/api/general/types';
import { McpServer } from '@hanzo_network/hanzo-message-ts/api/mcp-servers/types';

export type ImportMCPServerFromGithubURLInput = Token & {
  nodeAddress: string;
  githubUrl: string
};

export type ImportMCPServerFromGithubURLOutput = McpServer;