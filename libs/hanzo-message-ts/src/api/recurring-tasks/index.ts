import { httpClient } from '../../http-client';
import { urlJoin } from '../../utils/url-join';
import {
  type CreateRecurringTaskRequest,
  type CreateRecurringTaskResponse,
  type GetRecurringTaskLogsRequest,
  type GetRecurringTaskLogsResponse,
  type GetRecurringTaskRequest,
  type GetRecurringTaskResponse,
  type GetRecurringTasksNextExecutionTimeResponse,
  type GetRecurringTasksResponse,
  type RemoveRecurringTaskRequest,
  type RemoveRecurringTaskResponse,
  type SetRecurringTaskRequest,
  type SetRecurringTaskResponse,
} from './types';

export const createRecurringTask = async (
  nodeAddress: string,
  bearerToken: string,
  payload: CreateRecurringTaskRequest,
) => {
  const response = await httpClient.post(
    urlJoin(nodeAddress, '/v1/node/add_cron_task'),
    payload,
    {
      headers: { Authorization: `Bearer ${bearerToken}` },
      responseType: 'json',
    },
  );
  return response.data as CreateRecurringTaskResponse;
};

export const getRecurringTasks = async (
  nodeAddress: string,
  bearerToken: string,
) => {
  const response = await httpClient.get(
    urlJoin(nodeAddress, '/v1/node/list_all_cron_tasks'),
    {
      headers: { Authorization: `Bearer ${bearerToken}` },
      responseType: 'json',
    },
  );
  return response.data as GetRecurringTasksResponse;
};

export const getRecurringTask = async (
  nodeAddress: string,
  bearerToken: string,
  payload: GetRecurringTaskRequest,
) => {
  const response = await httpClient.get(
    urlJoin(nodeAddress, '/v1/node/get_specific_cron_task'),
    {
      headers: { Authorization: `Bearer ${bearerToken}` },
      params: { cron_task_id: payload.cron_task_id },
      responseType: 'json',
    },
  );
  return response.data as GetRecurringTaskResponse;
};

export const getRecurringTasksExecutionTime = async (
  nodeAddress: string,
  bearerToken: string,
) => {
  const response = await httpClient.get(
    urlJoin(nodeAddress, '/v1/node/get_cron_schedule'),
    {
      headers: { Authorization: `Bearer ${bearerToken}` },
      responseType: 'json',
    },
  );
  return response.data as GetRecurringTasksNextExecutionTimeResponse;
};

export const setRecurringTask = async (
  nodeAddress: string,
  bearerToken: string,
  payload: SetRecurringTaskRequest,
) => {
  const response = await httpClient.post(
    urlJoin(nodeAddress, '/v1/node/update_cron_task'),
    payload,
    {
      headers: { Authorization: `Bearer ${bearerToken}` },
      params: { cron_task_id: payload.cron_task_id },
      responseType: 'json',
    },
  );
  return response.data as SetRecurringTaskResponse;
};

export const removeRecurringTask = async (
  nodeAddress: string,
  bearerToken: string,
  payload: RemoveRecurringTaskRequest,
) => {
  const response = await httpClient.post(
    urlJoin(nodeAddress, '/v1/node/remove_cron_task'),
    payload,
    {
      headers: { Authorization: `Bearer ${bearerToken}` },
      params: { cron_task_id: payload.cron_task_id },
      responseType: 'json',
    },
  );
  return response.data as RemoveRecurringTaskResponse;
};

export const getRecurringTaskLogs = async (
  nodeAddress: string,
  bearerToken: string,
  payload: GetRecurringTaskLogsRequest,
) => {
  const response = await httpClient.get(
    urlJoin(nodeAddress, '/v1/node/get_cron_task_logs'),
    {
      headers: { Authorization: `Bearer ${bearerToken}` },
      params: { cron_task_id: payload.cron_task_id },
      responseType: 'json',
    },
  );
  return response.data as GetRecurringTaskLogsResponse;
};

export const runTaskNowApi = async (
  nodeAddress: string,
  token: string,
  taskId: string,
) => {
  const response = await httpClient.post(
    `${nodeAddress}/v1/node/force_execute_cron_task`,
    null, // No body needed for this request
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      params: {
        cron_task_id: taskId,
      },
    },
  );

  return response.data;
};
