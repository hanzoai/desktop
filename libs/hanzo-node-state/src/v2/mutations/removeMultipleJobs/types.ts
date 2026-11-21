import { type Token } from '@hanzo_network/hanzo-message-ts/api/general/types';
import { type RemoveJobsResponse } from '@hanzo_network/hanzo-message-ts/api/jobs/types';

export type RemoveJobsOutput = RemoveJobsResponse;

export type RemoveJobsInput = Token & {
  nodeAddress: string;
  jobIds: string[];
};
