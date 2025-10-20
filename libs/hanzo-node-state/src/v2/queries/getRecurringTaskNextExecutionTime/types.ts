import { type Token } from '@hanzo_network/hanzo-message-ts/api/general/types';
import { type GetRecurringTaskResponse } from '@hanzo_network/hanzo-message-ts/api/recurring-tasks/types';

export type GetRecurringTasksNextExecutionTimeInput = Token & {
  nodeAddress: string;
};

export type GetRecurringTasksNextExecutionTimeOutput = GetRecurringTaskResponse;
