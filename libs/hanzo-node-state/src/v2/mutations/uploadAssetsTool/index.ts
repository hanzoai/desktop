import { uploadAssetsToTool as uploadAssetsToToolApi } from '@hanzo_network/hanzo-message-ts/api/tools/index';

import { type UploadAssetsToToolInput } from './types';

export const uploadAssetsToTool = async ({
  nodeAddress,
  token,
  files,
  xHanzoAppId,
  xHanzoToolId,
}: UploadAssetsToToolInput) => {
  const response = await uploadAssetsToToolApi(
    nodeAddress,
    token,
    xHanzoAppId,
    xHanzoToolId,
    files,
  );

  return response;
};
