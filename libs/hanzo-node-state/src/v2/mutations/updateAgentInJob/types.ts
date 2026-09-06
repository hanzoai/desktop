import { type Token } from '@hanzo/desktop-message-ts/api/general/types';
import { type UpdateLLMProviderInJobResponse } from '@hanzo/desktop-message-ts/api/jobs/types';

export type UpdateAgentInJobInput = Token & {
  nodeAddress: string;
  jobId: string;
  newAgentId: string;
};

export type UpdateAgentInJobOutput = UpdateLLMProviderInJobResponse;
