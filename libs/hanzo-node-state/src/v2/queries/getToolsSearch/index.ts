import { searchTools as searchToolsApi } from '@hanzo/desktop-message-ts/api/tools/index';

import { type GetSearchToolsInput } from './types';

export const searchTools = async ({
  nodeAddress,
  token,
  search,
}: GetSearchToolsInput) => {
  const response = await searchToolsApi(nodeAddress, token, search);
  return response;
};
