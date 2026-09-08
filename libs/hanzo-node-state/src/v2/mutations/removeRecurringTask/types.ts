import { type Token } from '@hanzo/desktop-message-ts/api/general/types';
import { type RemoveRecurringTaskResponse } from '@hanzo/desktop-message-ts/api/recurring-tasks/types';

export type RemoveRecurringTaskOutput = RemoveRecurringTaskResponse;

export type RemoveRecurringTaskInput = Token & {
  nodeAddress: string;
  recurringTaskId: string;
};
