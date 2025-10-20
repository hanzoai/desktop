import { createTool as createToolApi } from '@hanzo_network/hanzo-message-ts/api/tools/index';

import { type CreateToolInput } from './types';

export const createTool = async ({
  nodeAddress,
  token,
  toolPayload,
  toolType,
  isToolEnabled,
}: CreateToolInput) => {
  const response = await createToolApi(nodeAddress, token, {
    content: [toolPayload, isToolEnabled],
    type: toolType,
  });
  return response;
};
