import { getSearchDirectoryContents as getSearchDirectoryContentsApi } from '@hanzo/desktop-message-ts/api/vector-fs/index';

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
