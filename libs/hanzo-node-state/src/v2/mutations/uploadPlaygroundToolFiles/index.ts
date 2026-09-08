import { uploadPlaygroundToolFiles as uploadPlaygroundToolFilesApi } from '@hanzo/desktop-message-ts/api/tools/index';

import { type UploadPlaygroundToolFilesInput } from './types';

export const uploadPlaygroundToolFiles = async ({
  nodeAddress,
  token,
  files,
  xHanzoAppId,
  xHanzoToolId,
}: UploadPlaygroundToolFilesInput) => {
  const response = await uploadPlaygroundToolFilesApi(
    nodeAddress,
    token,
    xHanzoAppId,
    xHanzoToolId,
    files,
  );

  return response;
};
