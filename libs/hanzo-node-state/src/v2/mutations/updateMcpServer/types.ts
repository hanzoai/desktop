import { Token } from '@hanzo/desktop-message-ts/api/general/types';
import { McpServer, McpServerType } from '@hanzo/desktop-message-ts/api/mcp-servers/types';
import { UpdateMcpServerRequest } from '@hanzo/desktop-message-ts/api/mcp-servers/types';

export type UpdateMcpServerInput = Token & {
  nodeAddress: string;
} & UpdateMcpServerRequest;

export type UpdateMcpServerResponse = McpServer;
