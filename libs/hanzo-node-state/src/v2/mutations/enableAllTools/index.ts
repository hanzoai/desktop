import { enableAllTools as enableAllToolsApi } from '@hanzo/desktop-message-ts/api/tools/index';

import { type EnableAllToolsInput } from './types';

export const enableAllTools = async ({
  nodeAddress,
  token,
}: EnableAllToolsInput) => {
  return await enableAllToolsApi(nodeAddress, token);
};
