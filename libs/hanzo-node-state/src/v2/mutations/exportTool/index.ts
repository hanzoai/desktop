import { exportTool as exportToolApi } from '@hanzo_network/hanzo-message-ts/api/tools/index';

import { type ExportToolInput } from './types';

export const exportTool = async ({
  nodeAddress,
  token,
  toolKey,
}: ExportToolInput) => {
  return await exportToolApi(nodeAddress, token, {
    toolKey,
  });
};
