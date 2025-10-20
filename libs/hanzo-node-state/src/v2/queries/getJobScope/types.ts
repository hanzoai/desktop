import { type Token } from '@hanzo_network/hanzo-message-ts/api/general/types';
import { type JobScope } from '@hanzo_network/hanzo-message-ts/api/jobs/types';

export type GetJobScopeInput = Token & {
  nodeAddress: string;
  jobId: string;
};

export type GetJobScopeOutput = JobScope;
