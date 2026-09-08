import { stopGeneratingLLM as stopGeneratingLLMApi } from '@hanzo/desktop-message-ts/api/jobs/index';

import { type StopGeneratingLLMInput } from './types';

export const stopGeneratingLLM = async ({
  nodeAddress,
  token,
  jobId,
}: StopGeneratingLLMInput) => {
  const response = await stopGeneratingLLMApi(nodeAddress, token, jobId);
  return response;
};
