import { type Token } from '@hanzo_network/hanzo-message-ts/api/general/types';
import {
  type McpServer,
  type McpServerType,
} from '@hanzo_network/hanzo-message-ts/api/mcp-servers/types';

export type AddMcpServerInput = Token & {
  nodeAddress: string;
} & (
    | {
        name: string;
        type: McpServerType.Command;
        command: string;
        env: Record<string, string>;
        is_enabled: boolean;
      }
    | {
        name: string;
        type: McpServerType.Sse;
        url: string;
        is_enabled: boolean;
      }
    | {
        name: string;
        type: McpServerType.Http;
        url: string;
        is_enabled: boolean;
      }
  );

export type AddMcpServerResponse = McpServer;
