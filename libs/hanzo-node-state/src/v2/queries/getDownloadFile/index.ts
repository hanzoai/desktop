import { downloadFile as downloadFileApi } from '@hanzo_network/hanzo-message-ts/api/jobs/index';

import { type GetDownloadFileInput } from './types';

export const downloadFile = async ({
  nodeAddress,
  token,
  path,
}: GetDownloadFileInput) => {
  return await downloadFileApi(nodeAddress, token, { path });
};
