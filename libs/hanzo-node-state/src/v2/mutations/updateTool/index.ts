import { updateTool as updateToolApi } from '@hanzo/desktop-message-ts/api/tools/index';

import { type UpdateToolInput } from './types';

export const updateTool = async ({
  nodeAddress,
  token,
  toolKey,
  toolType,
  toolPayload,
  isToolEnabled,
}: UpdateToolInput) => {
  const response = await updateToolApi(nodeAddress, token, toolKey, {
    content: [toolPayload, isToolEnabled],
    type: toolType,
  });
  return response;
};
