import { getJobFolderName as getJobFolderNameApi } from '@hanzo_network/hanzo-message-ts/api/jobs/index';

import  { type GetJobFolderNameInput } from './types';

export const getJobFolderName = async ({
  nodeAddress,
  token,
  jobId,
}: GetJobFolderNameInput) => {
  const result = await getJobFolderNameApi(nodeAddress, token, {
    job_id: jobId,
  });
  return result;
};
