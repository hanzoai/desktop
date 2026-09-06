import { type Token } from '@hanzo/desktop-message-ts/api/general/types';
import { type JobMessageResponse } from '@hanzo/desktop-message-ts/api/jobs/types';

export type RetryMessageInput = Token & {
  nodeAddress: string;
  inboxId: string;
  messageId: string;
};

export type RetryMessageOutput = JobMessageResponse;
