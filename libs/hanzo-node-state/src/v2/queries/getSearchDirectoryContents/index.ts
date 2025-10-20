import { getSearchDirectoryContents as getSearchDirectoryContentsApi } from '@hanzo_network/hanzo-message-ts/api/vector-fs/index';

import { type GetSearchDirectoryContentsInput } from './types';

export const getSearchDirectoryContents = async ({
  nodeAddress,
  token,
  name,
}: GetSearchDirectoryContentsInput) => {
  const response = await getSearchDirectoryContentsApi(nodeAddress, token, {
    name,
  });
  return response;
};
