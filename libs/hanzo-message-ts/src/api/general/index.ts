import { httpClient } from '../../http-client';
import { urlJoin } from '../../utils/url-join';
import {
  type CheckHealthResponse,
  type DockerStatusResponse,
  type EmbeddingMigrationRequest,
  type EmbeddingMigrationResponse,
  type GetEmbeddingMigrationStatusResponse,
  type GetNodeStorageLocationResponse,
  type GetPreferencesResponse,
  type GetHanzoFreeModelQuotaResponse,
  type InitialRegistrationRequest,
  type InitialRegistrationResponse,
  type SetPreferencesRequest,
  type SetPreferencesResponse,
} from './types';

export const checkHealth = async (nodeAddress: string) => {
  const response = await httpClient.get(
    urlJoin(nodeAddress, '/v1/node/health_check'),
    { responseType: 'json' },
  );
  return response.data as CheckHealthResponse;
};

export const getDockerStatus = async (nodeAddress: string) => {
  const response = await httpClient.get(
    urlJoin(nodeAddress, '/v1/node/docker_status'),
    { responseType: 'json' },
  );
  return response.data as DockerStatusResponse;
};

export const getNodeStorageLocation = async (
  nodeAddress: string,
  token: string,
): Promise<GetNodeStorageLocationResponse> => {
  const response = await httpClient.get(
    urlJoin(nodeAddress, '/v1/node/storage_location'),
    { responseType: 'json', headers: { Authorization: `Bearer ${token}` } },
  );
  return response.data;
};

export const updateNodeName = async (
  nodeAddress: string,
  token: string,
  newNodeName: string,
) => {
  const response = await httpClient.post(
    urlJoin(nodeAddress, '/v1/node/change_node_name'),
    { new_name: newNodeName },
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return response.data;
};

export const initialRegistration = async (
  nodeAddress: string,
  payload: InitialRegistrationRequest,
): Promise<InitialRegistrationResponse> => {
  const healthResponse = await checkHealth(nodeAddress);
  const { status, is_pristine } = healthResponse;
  if (status !== 'ok') {
    return { status: 'error' };
  }
  if (!is_pristine) {
    return { status: 'non-pristine' };
  }

  const response = await httpClient.post(
    urlJoin(nodeAddress, '/v1/node/initial_registration'),
    payload,
    { responseType: 'json' },
  );
  const data = response.data;
  return { status: 'success', data };
};

/**
 * Cloud free-tier quota is retired. The desktop is local-only and no longer
 * calls the cloud `/v2/hanzo_backend_quota` endpoint. Returns a zeroed,
 * no-quota response without any network request.
 */
export const getHanzoFreeModelQuota =
  async (): Promise<GetHanzoFreeModelQuotaResponse> => {
    return {
      has_quota: false,
      tokens_quota: 0,
      used_tokens: 0,
      reset_time: 0,
    };
  };

export const setPreferences = async (
  nodeAddress: string,
  bearerToken: string,
  payload: SetPreferencesRequest,
) => {
  const response = await httpClient.post(
    urlJoin(nodeAddress, '/v1/node/set_preferences'),
    payload,
    {
      headers: { Authorization: `Bearer ${bearerToken}` },
      responseType: 'json',
    },
  );
  return response.data as SetPreferencesResponse;
};

export const getPreferences = async (
  nodeAddress: string,
  bearerToken: string,
) => {
  const response = await httpClient.get(
    urlJoin(nodeAddress, '/v1/node/get_preferences'),
    {
      headers: { Authorization: `Bearer ${bearerToken}` },
      responseType: 'json',
    },
  );
  return response.data as GetPreferencesResponse;
};

export const startEmbeddingMigration = async (
  nodeAddress: string,
  bearerToken: string,
  payload: EmbeddingMigrationRequest,
) => {
  const response = await httpClient.post(
    urlJoin(nodeAddress, '/v1/node/embedding_migration'),
    payload,
    {
      headers: { Authorization: `Bearer ${bearerToken}` },
      responseType: 'json',
    },
  );
  return response.data as EmbeddingMigrationResponse;
};

export const getEmbeddingMigrationStatus = async (
  nodeAddress: string,
  bearerToken: string,
) => {
  const response = await httpClient.get(
    urlJoin(nodeAddress, '/v1/node/embedding_migration'),
    {
      headers: { Authorization: `Bearer ${bearerToken}` },
      responseType: 'json',
    },
  );
  return response.data as GetEmbeddingMigrationStatusResponse;
};
