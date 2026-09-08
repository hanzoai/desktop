import { Token } from '@hanzo/desktop-message-ts/api/general/types';
import { McpServer } from '@hanzo/desktop-message-ts/api/mcp-servers/types';

export type DeleteMcpServerInput = Token & {
  nodeAddress: string;
  id: number;
};

export type DeleteMcpServerResponse = McpServer; 