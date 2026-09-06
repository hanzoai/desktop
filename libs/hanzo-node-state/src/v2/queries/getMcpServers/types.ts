import { Token } from '@hanzo/desktop-message-ts/api/general/types';
import { GetMcpServersResponse } from '@hanzo/desktop-message-ts/api/mcp-servers/types';

export type GetMcpServersInput = Token & {
  nodeAddress: string;
};

export type GetMcpServersOutput = GetMcpServersResponse;
