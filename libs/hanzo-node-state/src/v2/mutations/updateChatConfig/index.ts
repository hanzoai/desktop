import { updateChatConfig as updateChatConfigApi } from '@hanzo_network/hanzo-message-ts/api/jobs/index';

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
