import { updateLLMProviderInJob } from '@hanzo/desktop-message-ts/api/jobs/index';

import { type UpdateAgentInJobInput } from './types';

export const updateAgentInJob = async ({
  nodeAddress,
  token,
  jobId,
  newAgentId,
}: UpdateAgentInJobInput) => {
  const response = await updateLLMProviderInJob(nodeAddress, token, {
    job_id: jobId,
    new_agent_id: newAgentId,
  });
  return response;
};
