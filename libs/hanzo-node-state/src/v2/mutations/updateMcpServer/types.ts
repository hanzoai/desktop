import { Token } from '@hanzo_network/hanzo-message-ts/api/general/types';
import { McpServer, McpServerType } from '@hanzo_network/hanzo-message-ts/api/mcp-servers/types';
import { UpdateMcpServerRequest } from '@hanzo_network/hanzo-message-ts/api/mcp-servers/types';

export type UpdateMcpServerInput = Token & {
  nodeAddress: string;
} & UpdateMcpServerRequest;

export type UpdateMcpServerResponse = McpServer;
