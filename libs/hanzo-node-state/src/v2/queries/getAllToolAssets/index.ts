import { getAllToolAssets as getAllToolAssetsApi } from '@hanzo/desktop-message-ts/api/tools/index';

import  { type GetAllToolAssetsInput } from './types';

export const getAllToolAssets = async ({
  nodeAddress,
  token,
  xHanzoAppId,
  xHanzoToolId,
}: GetAllToolAssetsInput) => {
  const result = await getAllToolAssetsApi(
    nodeAddress,
    token,
    xHanzoAppId,
    xHanzoToolId,
  );
  return result;
};
