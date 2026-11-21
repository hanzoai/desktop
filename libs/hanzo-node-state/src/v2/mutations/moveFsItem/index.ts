import { moveFsItem as moveFsItemApi } from '@hanzo_network/hanzo-message-ts/api/vector-fs/index';

import { type MoveFsItemInput } from './types';

export const moveFsItem = async ({
  nodeAddress,
  token,
  originPath,
  destinationPath,
}: MoveFsItemInput) => {
  return await moveFsItemApi(nodeAddress, token, {
    origin_path: originPath,
    destination_path: destinationPath,
  });
};
