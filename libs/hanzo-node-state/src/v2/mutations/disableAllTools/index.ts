import { disableAllTools as disableAllToolsApi } from '@hanzo/desktop-message-ts/api/tools/index';

import { type DisableAllToolsInput } from './types';

export const disableAllTools = async ({
  nodeAddress,
  token,
}: DisableAllToolsInput) => {
  return await disableAllToolsApi(nodeAddress, token);
};
