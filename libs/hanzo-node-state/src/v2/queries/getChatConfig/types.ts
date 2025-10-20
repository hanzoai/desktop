import { type Token } from '@hanzo_network/hanzo-message-ts/api/general/types';
import { type GetChatConfigResponse } from '@hanzo_network/hanzo-message-ts/api/jobs/types';

export type GetChatConfigInput = Token & {
  nodeAddress: string;
  jobId: string;
};

export type GetChatConfigOutput = GetChatConfigResponse;
