import { type Token } from '@hanzo/desktop-message-ts/api/general/types';
import { type GetRecurringTasksResponse } from '@hanzo/desktop-message-ts/api/recurring-tasks/types';

export type GetRecurringTasksInput = Token & {
  nodeAddress: string;
};

export type GetRecurringTasksOutput = GetRecurringTasksResponse;
