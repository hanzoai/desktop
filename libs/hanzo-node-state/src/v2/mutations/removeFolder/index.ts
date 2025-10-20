import { removeFolder as removeFolderApi } from '@hanzo_network/hanzo-message-ts/api/vector-fs/index';

import { type RemoveFolderInput } from './types';

export const removeFolder = async ({
  nodeAddress,
  token,
  folderPath,
}: RemoveFolderInput) => {
  return await removeFolderApi(nodeAddress, token, {
    path: folderPath,
  });
};
