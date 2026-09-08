import { type Token } from '@hanzo/desktop-message-ts/api/general/types';
import {
  type JobConfig,
  type UpdateChatConfigResponse,
} from '@hanzo/desktop-message-ts/api/jobs/types';

export type UpdateChatConfigOutput = UpdateChatConfigResponse;

export type UpdateChatConfigInput = Token & {
  nodeAddress: string;
  jobId: string;
  jobConfig: JobConfig;
};
