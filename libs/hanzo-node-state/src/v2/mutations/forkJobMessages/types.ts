import { type Token } from '@hanzo_network/hanzo-message-ts/api/general/types';
import { type ForkJobMessagesResponse } from '@hanzo_network/hanzo-message-ts/api/jobs/types';

export type ForkJobMessagesInput = Token & {
  nodeAddress: string;
  jobId: string;
  messageId: string;
};

export type ForkJobMessagesOutput = ForkJobMessagesResponse;
