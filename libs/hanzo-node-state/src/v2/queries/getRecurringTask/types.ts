import { type Token } from '@hanzo/desktop-message-ts/api/general/types';
import { type GetRecurringTaskResponse } from '@hanzo/desktop-message-ts/api/recurring-tasks/types';

export type GetRecurringTaskInput = Token & {
  nodeAddress: string;
  recurringTaskId: string;
};

export type GetRecurringTaskOutput = GetRecurringTaskResponse;
