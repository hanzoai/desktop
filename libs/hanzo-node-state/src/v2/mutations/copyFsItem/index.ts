import { copyFsItem as copyFsItemApi } from '@hanzo_network/hanzo-message-ts/api/vector-fs/index';

import { type CopyVRItemInput } from './types';

export const copyFsItem = async ({
  nodeAddress,
  token,
  originPath,
  destinationPath,
}: CopyVRItemInput) => {
  return await copyFsItemApi(nodeAddress, token, {
    destination_path: destinationPath,
    origin_path: originPath,
  });
};
