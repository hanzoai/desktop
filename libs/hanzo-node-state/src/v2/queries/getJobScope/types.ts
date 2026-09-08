import { type Token } from '@hanzo/desktop-message-ts/api/general/types';
import { type JobScope } from '@hanzo/desktop-message-ts/api/jobs/types';

export type GetJobScopeInput = Token & {
  nodeAddress: string;
  jobId: string;
};

export type GetJobScopeOutput = JobScope;
