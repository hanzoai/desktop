import { copyFolder as copyFolderApi } from '@hanzo_network/hanzo-message-ts/api/vector-fs/index';

import { type CopyFolderInput } from './types';

export const copyFolder = async ({
  nodeAddress,
  token,
  originPath,
  destinationPath,
}: CopyFolderInput) => {
  return await copyFolderApi(nodeAddress, token, {
    destination_path: destinationPath,
    origin_path: originPath,
  });
};
