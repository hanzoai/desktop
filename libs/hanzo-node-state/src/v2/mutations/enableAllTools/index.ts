import { enableAllTools as enableAllToolsApi } from '@hanzo_network/hanzo-message-ts/api/tools/index';

import { type EnableAllToolsInput } from './types';

export const enableAllTools = async ({
  nodeAddress,
  token,
}: EnableAllToolsInput) => {
  return await enableAllToolsApi(nodeAddress, token);
};
