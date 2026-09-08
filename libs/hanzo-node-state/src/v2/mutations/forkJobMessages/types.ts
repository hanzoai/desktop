import { type Token } from '@hanzo/desktop-message-ts/api/general/types';
import { type ForkJobMessagesResponse } from '@hanzo/desktop-message-ts/api/jobs/types';

export type ForkJobMessagesInput = Token & {
  nodeAddress: string;
  jobId: string;
  messageId: string;
};

export type ForkJobMessagesOutput = ForkJobMessagesResponse;
