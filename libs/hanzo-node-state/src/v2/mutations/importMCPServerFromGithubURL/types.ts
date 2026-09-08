import { Token } from '@hanzo/desktop-message-ts/api/general/types';
import { McpServer } from '@hanzo/desktop-message-ts/api/mcp-servers/types';

export type ImportMCPServerFromGithubURLInput = Token & {
  nodeAddress: string;
  githubUrl: string
};

export type ImportMCPServerFromGithubURLOutput = McpServer;