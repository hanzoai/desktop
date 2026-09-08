import { type Token } from '@hanzo/desktop-message-ts/api/general/types';
import { type RemoveJobsResponse } from '@hanzo/desktop-message-ts/api/jobs/types';

export type RemoveJobsOutput = RemoveJobsResponse;

export type RemoveJobsInput = Token & {
  nodeAddress: string;
  jobIds: string[];
};
