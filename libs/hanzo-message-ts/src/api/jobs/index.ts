import { httpClient } from '../../http-client';
import { urlJoin } from '../../utils/url-join';
import {
  type AddFileToInboxRequest,
  type AddFileToInboxResponse,
  type AddFileToJobRequest,
  type AddLLMProviderRequest,
  type AddLLMProviderResponse,
  type CreateFilesInboxResponse,
  type CreateJobRequest,
  type CreateJobResponse,
  type ForkJobMessagesRequest,
  type ForkJobMessagesResponse,
  type ExportMessagesFromInboxRequest,
  type ExportMessagesFromInboxResponse,
  type GetAllAgentInboxesRequest,
  type GetAllInboxesResponse,
  type GetAllInboxesWithPaginationRequest,
  type GetAllInboxesWithPaginationResponse,
  type GetChatConfigRequest,
  type GetChatConfigResponse,
  type GetDownloadFileRequest,
  type GetDownloadFileResponse,
  type GetFileNamesRequest,
  type GetFileNamesResponse,
  type GetJobFolderNameRequest,
  type GetJobFolderNameResponse,
  type GetJobScopeRequest,
  type GetJobScopeResponse,
  type GetLastMessagesRequest,
  type GetLastMessagesResponse,
  type GetLastMessagesWithBranchesRequest,
  type GetLastMessagesWithBranchesResponse,
  type GetLLMProvidersResponse,
  type GetProviderFromJobRequest,
  type GetProviderFromJobResponse,
  type JobMessageRequest,
  type JobMessageResponse,
  type LLMProviderInterface,
  type RemoveJobRequest,
  type RemoveJobsRequest,
  type RemoveJobsResponse,
  type RemoveJobsFailedItem,
  type RemoveLLMProviderRequest,
  type RetryMessageRequest,
  type StopGeneratingLLMRequest,
  type UpdateChatConfigRequest,
  type UpdateChatConfigResponse,
  type UpdateInboxNameRequest,
  type UpdateInboxNameResponse,
  type UpdateJobScopeRequest,
  type UpdateLLMProviderInJobRequest,
  type UpdateLLMProviderInJobResponse,
  type UpdateLLMProviderRequest,
  type UpdateLLMProviderResponse,
  type GetMessageTracesRequest,
  type GetMessageTracesResponse,
} from './types';

export const createJob = async (
  nodeAddress: string,
  bearerToken: string,
  payload: CreateJobRequest,
) => {
  const response = await httpClient.post(
    urlJoin(nodeAddress, '/v1/node/create_job'),
    payload,
    {
      headers: { Authorization: `Bearer ${bearerToken}` },
      responseType: 'json',
    },
  );
  const data = response.data;
  return data as CreateJobResponse;
};

export const sendMessageToJob = async (
  nodeAddress: string,
  bearerToken: string,
  payload: JobMessageRequest,
) => {
  const response = await httpClient.post(
    urlJoin(nodeAddress, '/v1/node/job_message'),
    payload,
    {
      headers: { Authorization: `Bearer ${bearerToken}` },
      responseType: 'json',
    },
  );
  return response.data as JobMessageResponse;
};

export const getLastMessages = async (
  nodeAddress: string,
  bearerToken: string,
  payload: GetLastMessagesRequest,
) => {
  const response = await httpClient.post(
    urlJoin(nodeAddress, '/v1/node/last_messages'),
    payload,
    {
      headers: { Authorization: `Bearer ${bearerToken}` },
      responseType: 'json',
    },
  );
  return response.data as GetLastMessagesResponse;
};
export const getLastMessagesWithBranches = async (
  nodeAddress: string,
  bearerToken: string,
  payload: GetLastMessagesWithBranchesRequest,
) => {
  const response = await httpClient.post(
    urlJoin(nodeAddress, '/v1/node/last_messages_with_branches'),
    payload,
    {
      headers: { Authorization: `Bearer ${bearerToken}` },
      responseType: 'json',
    },
  );
  return response.data as GetLastMessagesWithBranchesResponse;
};

export const updateLLMProviderInJob = async (
  nodeAddress: string,
  bearerToken: string,
  payload: UpdateLLMProviderInJobRequest,
) => {
  const response = await httpClient.post(
    urlJoin(nodeAddress, '/v1/node/change_job_llm_provider'),
    payload,
    {
      headers: { Authorization: `Bearer ${bearerToken}` },
      responseType: 'json',
    },
  );
  return response.data as UpdateLLMProviderInJobResponse;
};
export const getFileNames = async (
  nodeAddress: string,
  bearerToken: string,
  payload: GetFileNamesRequest,
) => {
  // No `list_files_in_inbox` route on the node; `retrieve_files_for_job` (keyed by
  // job_id) is the equivalent. Flatten the returned directory tree to file names.
  const response = await httpClient.get(
    urlJoin(nodeAddress, '/v1/node/retrieve_files_for_job'),
    {
      params: { job_id: payload.inboxName },
      headers: { Authorization: `Bearer ${bearerToken}` },
      responseType: 'json',
    },
  );
  type Entry = { name: string; is_directory: boolean; children?: Entry[] };
  const names: string[] = [];
  const walk = (items: Entry[]) => {
    for (const item of items ?? []) {
      if (item.is_directory) walk(item.children ?? []);
      else names.push(item.name);
    }
  };
  walk((response.data as Entry[]) ?? []);
  return names as GetFileNamesResponse;
};

export const createFilesInbox = async (
  nodeAddress: string,
  bearerToken: string,
) => {
  const response = await httpClient.post(
    urlJoin(nodeAddress, '/v1/node/create_files_inbox'),
    undefined,
    {
      headers: { Authorization: `Bearer ${bearerToken}` },
      responseType: 'json',
    },
  );
  return response.data as CreateFilesInboxResponse;
};

// TODO: remove this
export const addFileToInbox = async (
  nodeAddress: string,
  bearerToken: string,
  payload: AddFileToInboxRequest,
) => {
  const fileData = await payload.file.arrayBuffer();

  const formData = new FormData();
  formData.append('file_inbox_name', payload.file_inbox_name);
  formData.append('filename', payload.filename);
  formData.append('file_data', new Blob([fileData]));

  const response = await httpClient.post(
    urlJoin(nodeAddress, '/v1/node/add_file_to_inbox'),
    formData,
    {
      headers: { Authorization: `Bearer ${bearerToken}` },
      responseType: 'json',
    },
  );

  return response.data as AddFileToInboxResponse;
};

export const addFileToJob = async (
  nodeAddress: string,
  bearerToken: string,
  payload: AddFileToJobRequest,
): Promise<AddFileToInboxResponse> => {
  const fileData = await payload.file.arrayBuffer();

  const formData = new FormData();
  formData.append('job_id', payload.job_id);
  formData.append('filename', payload.filename);
  formData.append('file_data', new Blob([fileData]));

  const response = await httpClient.post(
    urlJoin(nodeAddress, '/v1/node/upload_file_to_job'),
    formData,
    {
      headers: { Authorization: `Bearer ${bearerToken}` },
      responseType: 'json',
    },
  );

  return response.data as AddFileToInboxResponse;
};

export const uploadFilesToJob = async (
  nodeAddress: string,
  bearerToken: string,
  jobId: string,
  files: File[],
): Promise<AddFileToInboxResponse[]> => {
  const responses: AddFileToInboxResponse[] = [];
  for (const file of files) {
    const response = await addFileToJob(nodeAddress, bearerToken, {
      filename: encodeURIComponent(file.name),
      job_id: jobId,
      file,
    });
    responses.push(response);
  }
  return responses;
};

export const getJobFolderName = async (
  nodeAddress: string,
  bearerToken: string,
  payload: GetJobFolderNameRequest,
) => {
  const response = await httpClient.get(
    urlJoin(nodeAddress, '/v1/node/get_folder_name_for_job'),
    {
      headers: { Authorization: `Bearer ${bearerToken}` },
      responseType: 'json',
      params: { job_id: payload.job_id },
    },
  );
  return response.data as GetJobFolderNameResponse;
};

export const downloadFile = async (
  nodeAddress: string,
  bearerToken: string,
  payload: GetDownloadFileRequest,
) => {
  const response = await httpClient.get(
    urlJoin(nodeAddress, `/v1/node/download_file`),
    {
      headers: { Authorization: `Bearer ${bearerToken}` },
      params: payload,
    },
  );
  return response.data as GetDownloadFileResponse;
};

export const getLLMProviders = async (
  nodeAddress: string,
  bearerToken: string,
) => {
  const response = await httpClient.get(
    urlJoin(nodeAddress, '/v1/node/available_models'),
    {
      headers: { Authorization: `Bearer ${bearerToken}` },
      responseType: 'json',
    },
  );
  return response.data as GetLLMProvidersResponse;
};

export enum ModelPrefix {
  OpenAI = 'openai',
  OpenAILegacy = 'openai-legacy',
  TogetherAI = 'togetherai',
  // Wire-protocol prefix for the local-engine variant. The node's
  // `LLMProviderInterface::from_str` parses `local:<model>` and serdes the
  // `LocalEngine` variant.
  LocalEngine = 'local',
  Gemini = 'gemini',
  Groq = 'groq',
  OpenRouter = 'openrouter',
  Exo = 'exo',
  Claude = 'claude',
  DeepSeek = 'deepseek',
  Grok = 'grok',
}

function getModelString(model: LLMProviderInterface): string {
  if (model?.OpenAI?.model_type) {
    return ModelPrefix.OpenAI + ':' + model.OpenAI.model_type;
  } else if (model?.OpenAILegacy?.model_type) {
    return ModelPrefix.OpenAILegacy + ':' + model.OpenAILegacy.model_type;
  } else if (model?.TogetherAI?.model_type) {
    return ModelPrefix.TogetherAI + ':' + model.TogetherAI.model_type;
  } else if (model?.LocalEngine?.model_type) {
    return ModelPrefix.LocalEngine + ':' + model.LocalEngine.model_type;
  } else if (model?.Gemini?.model_type) {
    return ModelPrefix.Gemini + ':' + model.Gemini.model_type;
  } else if (model?.Groq?.model_type) {
    return ModelPrefix.Groq + ':' + model.Groq.model_type;
  } else if (model?.OpenRouter?.model_type) {
    return ModelPrefix.OpenRouter + ':' + model.OpenRouter.model_type;
  } else if (model?.Exo?.model_type) {
    return ModelPrefix.Exo + ':' + model.Exo.model_type;
  } else if (model?.Claude?.model_type) {
    return ModelPrefix.Claude + ':' + model.Claude.model_type;
  } else if (model?.DeepSeek?.model_type) {
    return ModelPrefix.DeepSeek + ':' + model.DeepSeek.model_type;
  } else if (model?.Grok?.model_type) {
    return ModelPrefix.Grok + ':' + model.Grok.model_type;
  } else if (Object.keys(model).length > 0) {
    const customModelProvider = Object.keys(model)[0];
    return `${customModelProvider}:${model[customModelProvider].model_type}`;
  } else {
    throw new Error('Invalid model: ' + JSON.stringify(model));
  }
}

export const addLLMProvider = async (
  nodeAddress: string,
  bearerToken: string,
  payload: AddLLMProviderRequest,
) => {
  const response = await httpClient.post(
    urlJoin(nodeAddress, '/v1/node/add_llm_provider'),
    { ...payload, model: getModelString(payload.model) },
    {
      headers: { Authorization: `Bearer ${bearerToken}` },
      responseType: 'json',
    },
  );
  return response.data as AddLLMProviderResponse;
};
export const testLLMProvider = async (
  nodeAddress: string,
  bearerToken: string,
  payload: AddLLMProviderRequest,
) => {
  const response = await httpClient.post(
    urlJoin(nodeAddress, '/v1/node/test_llm_provider'),
    { ...payload, model: getModelString(payload.model) },
    {
      headers: { Authorization: `Bearer ${bearerToken}` },
      responseType: 'json',
    },
  );
  return response.data as AddLLMProviderResponse;
};

export const updateLLMProvider = async (
  nodeAddress: string,
  bearerToken: string,
  payload: UpdateLLMProviderRequest,
) => {
  const response = await httpClient.post(
    urlJoin(nodeAddress, '/v1/node/modify_llm_provider'),
    { ...payload, model: getModelString(payload.model) },
    {
      headers: { Authorization: `Bearer ${bearerToken}` },
      responseType: 'json',
    },
  );
  return response.data as UpdateLLMProviderResponse;
};

export const removeLLMProvider = async (
  nodeAddress: string,
  bearerToken: string,
  payload: RemoveLLMProviderRequest,
) => {
  const response = await httpClient.post(
    urlJoin(nodeAddress, '/v1/node/remove_llm_provider'),
    payload,
    {
      headers: { Authorization: `Bearer ${bearerToken}` },
      responseType: 'json',
    },
  );
  return response.data;
};

export const getAllInboxes = async (
  nodeAddress: string,
  bearerToken: string,
) => {
  const response = await httpClient.get(
    urlJoin(nodeAddress, '/v1/node/all_inboxes'),
    {
      headers: { Authorization: `Bearer ${bearerToken}` },
      responseType: 'json',
    },
  );
  return response.data as GetAllInboxesResponse;
};
export const getAllAgentInboxes = async (
  nodeAddress: string,
  bearerToken: string,
  payload: GetAllAgentInboxesRequest,
) => {
  const response = await httpClient.get(
    urlJoin(nodeAddress, '/v1/node/all_inboxes'),
    {
      headers: { Authorization: `Bearer ${bearerToken}` },
      responseType: 'json',
      params: {
        agent_id: payload.agent_id,
        show_hidden: payload.show_hidden,
      },
    },
  );
  return response.data as GetAllInboxesResponse;
};

export const getAllInboxesWithPagination = async (
  nodeAddress: string,
  bearerToken: string,
  payload: GetAllInboxesWithPaginationRequest,
) => {
  const response = await httpClient.get(
    urlJoin(nodeAddress, '/v1/node/all_inboxes_paginated'),
    {
      headers: { Authorization: `Bearer ${bearerToken}` },
      responseType: 'json',
      params: payload,
    },
  );
  return response.data as GetAllInboxesWithPaginationResponse;
};

export const updateInboxName = async (
  nodeAddress: string,
  bearerToken: string,
  payload: UpdateInboxNameRequest,
) => {
  const response = await httpClient.post(
    urlJoin(nodeAddress, '/v1/node/update_smart_inbox_name'),
    payload,
    {
      headers: { Authorization: `Bearer ${bearerToken}` },
      responseType: 'json',
    },
  );
  return response.data as UpdateInboxNameResponse;
};

export const getJobConfig = async (
  nodeAddress: string,
  bearerToken: string,
  payload: GetChatConfigRequest,
) => {
  const response = await httpClient.get(
    urlJoin(nodeAddress, '/v1/node/get_job_config'),
    {
      headers: { Authorization: `Bearer ${bearerToken}` },
      responseType: 'json',
      params: {
        job_id: payload.job_id,
      },
    },
  );
  return response.data as GetChatConfigResponse;
};

export const updateChatConfig = async (
  nodeAddress: string,
  bearerToken: string,
  payload: UpdateChatConfigRequest,
) => {
  const response = await httpClient.post(
    urlJoin(nodeAddress, '/v1/node/update_job_config'),
    payload,
    {
      headers: { Authorization: `Bearer ${bearerToken}` },
      responseType: 'json',
    },
  );
  return response.data as UpdateChatConfigResponse;
};

export const stopGeneratingLLM = async (
  nodeAddress: string,
  bearerToken: string,
  jobId: StopGeneratingLLMRequest,
) => {
  const response = await httpClient.post(
    urlJoin(nodeAddress, '/v1/node/stop_llm'),
    { inbox_name: jobId },
    {
      headers: { Authorization: `Bearer ${bearerToken}` },
      responseType: 'json',
    },
  );
  return response.data;
};

export const getJobScope = async (
  nodeAddress: string,
  bearerToken: string,
  payload: GetJobScopeRequest,
) => {
  const response = await httpClient.get(
    urlJoin(nodeAddress, '/v1/node/get_job_scope'),
    {
      headers: { Authorization: `Bearer ${bearerToken}` },
      responseType: 'json',
      params: { job_id: payload.jobId },
    },
  );
  return response.data as GetJobScopeResponse;
};
export const updateJobScope = async (
  nodeAddress: string,
  bearerToken: string,
  payload: UpdateJobScopeRequest,
) => {
  const response = await httpClient.post(
    urlJoin(nodeAddress, '/v1/node/update_job_scope'),
    payload,
    {
      headers: { Authorization: `Bearer ${bearerToken}` },
      responseType: 'json',
    },
  );
  return response.data;
};

export const retryMessage = async (
  nodeAddress: string,
  bearerToken: string,
  payload: RetryMessageRequest,
) => {
  const response = await httpClient.post(
    urlJoin(nodeAddress, '/v1/node/retry_message'),
    payload,
    {
      headers: { Authorization: `Bearer ${bearerToken}` },
      responseType: 'json',
    },
  );
  return response.data;
};

export const removeJob = async (
  nodeAddress: string,
  bearerToken: string,
  payload: RemoveJobRequest,
) => {
  const response = await httpClient.post(
    urlJoin(nodeAddress, '/v1/node/remove_job'),
    payload,
    {
      headers: { Authorization: `Bearer ${bearerToken}` },
      responseType: 'json',
    },
  );
  return response.data;
};

export const removeJobs = async (
  nodeAddress: string,
  bearerToken: string,
  payload: RemoveJobsRequest,
) => {
  // The node has no bulk `remove_jobs` route — only singular `remove_job`. Fan out
  // singular deletes and synthesize the bulk response shape the UI expects.
  const results = await Promise.allSettled(
    payload.job_ids.map((job_id) =>
      httpClient
        .post(
          urlJoin(nodeAddress, '/v1/node/remove_job'),
          { job_id },
          {
            headers: { Authorization: `Bearer ${bearerToken}` },
            responseType: 'json',
          },
        )
        .then(() => job_id),
    ),
  );

  const succeeded: string[] = [];
  const failed: RemoveJobsFailedItem[] = [];
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      succeeded.push(result.value);
    } else {
      const reason = result.reason as
        | { response?: { data?: { message?: string } }; message?: string }
        | undefined;
      failed.push({
        job_id: payload.job_ids[index],
        error:
          reason?.response?.data?.message ?? reason?.message ?? 'Failed to remove job',
      });
    }
  });

  return {
    status: failed.length === 0 ? 'success' : 'partial',
    message:
      failed.length === 0
        ? `Successfully removed ${succeeded.length} job(s)`
        : `Removed ${succeeded.length} job(s), ${failed.length} failed`,
    succeeded,
    failed,
  };
};

export const getProviderFromJob = async (
  nodeAddress: string,
  bearerToken: string,
  payload: GetProviderFromJobRequest,
) => {
  const response = await httpClient.get(
    urlJoin(nodeAddress, '/v1/node/get_job_provider'),
    {
      params: { job_id: payload.job_id },
      headers: { Authorization: `Bearer ${bearerToken}` },
      responseType: 'json',
    },
  );
  return response.data as GetProviderFromJobResponse;
};

export const forkJobMessages = async (
  nodeAddress: string,
  bearerToken: string,
  payload: ForkJobMessagesRequest,
) => {
  const response = await httpClient.post(
    urlJoin(nodeAddress, '/v1/node/fork_job_messages'),
    payload,
    {
      headers: { Authorization: `Bearer ${bearerToken}` },
      responseType: 'json',
    },
  );
  return response.data as ForkJobMessagesResponse;
};

export const exportMessagesFromInbox = async (
  nodeAddress: string,
  bearerToken: string,
  payload: ExportMessagesFromInboxRequest,
) => {
  const response = await httpClient.post(
    urlJoin(nodeAddress, '/v1/node/export_messages_from_inbox'),
    payload,
    {
      headers: { Authorization: `Bearer ${bearerToken}` },
      responseType: 'blob',
    },
  );
  return response.data as ExportMessagesFromInboxResponse;
};

export const getMessageTraces = async (
  nodeAddress: string,
  bearerToken: string,
  payload: GetMessageTracesRequest,
) => {
  const response = await httpClient.get(
    urlJoin(nodeAddress, '/v1/node/get_message_traces'),
    {
      headers: { Authorization: `Bearer ${bearerToken}` },
      responseType: 'json',
      params: { message_id: payload.message_id },
    },
  );
  return response.data as GetMessageTracesResponse;
};
