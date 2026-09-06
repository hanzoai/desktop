import { type Token } from '@hanzo/desktop-message-ts/api/general/types';
import { type GetChatConfigResponse } from '@hanzo/desktop-message-ts/api/jobs/types';

export type GetChatConfigInput = Token & {
  nodeAddress: string;
  jobId: string;
};

export type GetChatConfigOutput = GetChatConfigResponse;
