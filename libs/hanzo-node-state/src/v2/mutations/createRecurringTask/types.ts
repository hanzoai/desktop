import { type Token } from '@hanzo/desktop-message-ts/api/general/types';
import { type JobConfig } from '@hanzo/desktop-message-ts/api/jobs/types';
import {
  type CreateRecurringTaskResponse
} from '@hanzo/desktop-message-ts/api/recurring-tasks/types';

export type CreateRecurringTaskOutput = CreateRecurringTaskResponse;

export type CreateRecurringTaskInput = Token & {
  nodeAddress: string;
  name: string;
  description?: string;
  cronExpression: string;
  message: string;
  toolKey?: string;
  llmProvider: string;
  // recurringTaskAction: RecurringTaskAction;
  chatConfig: JobConfig;
};
