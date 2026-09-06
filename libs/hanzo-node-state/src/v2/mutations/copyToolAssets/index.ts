import { copyToolAssets as copyToolAssetsApi } from '@hanzo/desktop-message-ts/api/tools/index';

import { type CopyToolAssetsInput } from './types';

export const copyToolAssets = async ({
  nodeAddress,
  token,
  xHanzoAppId,
  currentToolKeyPath,
}: CopyToolAssetsInput) => {
  return await copyToolAssetsApi(nodeAddress, token, {
    is_first_playground: false,
    first_path: currentToolKeyPath,
    second_path: xHanzoAppId,
    is_second_playground: true,
  });
};
