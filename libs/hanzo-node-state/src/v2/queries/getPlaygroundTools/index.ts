import { getPlaygroundTools as getPlaygroundToolsApi } from '@hanzo/desktop-message-ts/api/tools/index';

import { type GetPlaygroundToolsInput } from './types';

export const getPlaygroundTools = async ({
  nodeAddress,
  token,
}: GetPlaygroundToolsInput) => {
  const response = await getPlaygroundToolsApi(nodeAddress, token);
  return response;
};
