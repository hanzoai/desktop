import { Token } from '@hanzo_network/hanzo-message-ts/api/general/types';
import { GetMcpServersResponse } from '@hanzo_network/hanzo-message-ts/api/mcp-servers/types';

export type GetMcpServersInput = Token & {
  nodeAddress: string;
};

export type GetMcpServersOutput = GetMcpServersResponse;
