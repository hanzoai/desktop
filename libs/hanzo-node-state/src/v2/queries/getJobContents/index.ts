import { retrieveFilesForJob as retrieveFilesForJobApi } from '@hanzo/desktop-message-ts/api/vector-fs/index';

import { type GetJobContentsInput } from './types';

export const getJobContents = async ({
  nodeAddress,
  jobId,
  token,
}: GetJobContentsInput) => {
  const response = await retrieveFilesForJobApi(nodeAddress, token, {
    job_id: jobId,
  });

  return response;
};
