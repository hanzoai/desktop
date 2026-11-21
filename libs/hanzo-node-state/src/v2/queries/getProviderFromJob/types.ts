import { type Token } from '@hanzo_network/hanzo-message-ts/api/general/types';
import { type GetProviderFromJobResponse } from '@hanzo_network/hanzo-message-ts/api/jobs/types';

export type GetProviderFromJobInput = Token & {
  nodeAddress: string;
  jobId: string;
};

export type GetProviderFromJobOutput = GetProviderFromJobResponse;
