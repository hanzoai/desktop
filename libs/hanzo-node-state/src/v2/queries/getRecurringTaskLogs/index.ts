import { getRecurringTaskLogs as getRecurringTaskLogsApi } from '@hanzo/desktop-message-ts/api/recurring-tasks/index';

import  { type GetRecurringTaskLogsInput } from './types';

export const getRecurringTaskLogs = async ({
  nodeAddress,
  token,
  recurringTaskId,
}: GetRecurringTaskLogsInput) => {
  const result = await getRecurringTaskLogsApi(nodeAddress, token, {
    cron_task_id: recurringTaskId,
  });
  return result;
};
