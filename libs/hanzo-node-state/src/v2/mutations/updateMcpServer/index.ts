import { updateMcpServer as updateMcpServerApi } from '@hanzo_network/hanzo-message-ts/api/mcp-servers/index';
import { UpdateMcpServerRequest } from '@hanzo_network/hanzo-message-ts/api/mcp-servers/types';

import { UpdateMcpServerInput } from './types';

export const updateMcpServer = async (input: UpdateMcpServerInput) => {
  const { nodeAddress, token, ...rest } = input;
  return updateMcpServerApi(nodeAddress, token, rest as UpdateMcpServerRequest);
};