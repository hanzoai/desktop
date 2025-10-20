import { type Token } from '@hanzo_network/hanzo-message-ts/api/general/types';
import { type GetRecurringTasksResponse } from '@hanzo_network/hanzo-message-ts/api/recurring-tasks/types';

export type GetRecurringTasksInput = Token & {
  nodeAddress: string;
};

export type GetRecurringTasksOutput = GetRecurringTasksResponse;
