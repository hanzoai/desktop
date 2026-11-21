import { type Token } from '@hanzo_network/hanzo-message-ts/api/general/types';
import {
  type JobScope,
  type UpdateChatConfigResponse,
} from '@hanzo_network/hanzo-message-ts/api/jobs/types';

export type UpdateChatConfigOutput = UpdateChatConfigResponse;

export type UpdateChatConfigInput = Token & {
  nodeAddress: string;
  jobId: string;
  jobScope: JobScope;
};
