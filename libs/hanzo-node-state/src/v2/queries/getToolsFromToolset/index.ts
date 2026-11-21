import { getToolsFromToolset as getToolsFromToolsetApi } from '@hanzo_network/hanzo-message-ts/api/tools/index';

import { type GetToolsFromToolsetInput, type GetToolsFromToolsetOutput } from './types';

export const getToolsFromToolset = async ({
  nodeAddress,
  token,
  tool_set_key,
}: GetToolsFromToolsetInput): Promise<GetToolsFromToolsetOutput> => {
  if (!tool_set_key) return [];
  const response = await getToolsFromToolsetApi(
    nodeAddress,
    token,
    tool_set_key,
  );
  return response;
};
