import { updateChatConfig as updateChatConfigApi } from '@hanzo/desktop-message-ts/api/jobs/index';

import { type UpdateChatConfigInput } from './types';

export const updateChatConfig = async ({
  nodeAddress,
  token,
  jobId,
  jobConfig,
}: UpdateChatConfigInput) => {
  const response = await updateChatConfigApi(nodeAddress, token, {
    job_id: jobId,
    config: jobConfig,
  });
  return response;
};
