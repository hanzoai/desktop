import { uploadFilesToVR } from '@hanzo_network/hanzo-message-ts/api/vector-fs/index';

import { type UploadVRFilesInput } from './types';

export const uploadVRFiles = async ({
  nodeAddress,
  token,
  destinationPath,
  files,
}: UploadVRFilesInput) => {
  const response = await uploadFilesToVR(
    nodeAddress,
    token,
    destinationPath,
    files,
  );

  return response;
};
