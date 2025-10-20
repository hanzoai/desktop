import { setPreferences } from '@hanzo_network/hanzo-message-ts/api/general/index';
import {
  QueryClient,
  type QueryObserverOptions,
  useMutation,
  type UseMutationOptions,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { relaunch } from '@tauri-apps/plugin-process';

import { type HanzoNodeOptions } from './hanzo-node-manager-client-types';

// Client

export const hanzoNodeQueryClient = new QueryClient();

// Queries
export const useHanzoNodeIsRunningQuery = (
  options?: Omit<QueryObserverOptions, 'queryKey'>,
): UseQueryResult<boolean, Error> => {
  const query = useQuery({
    queryKey: ['hanzo_node_is_running'],
    queryFn: (): Promise<boolean> => invoke('hanzo_node_is_running'),
    ...options,
  });
  return { ...query } as UseQueryResult<boolean, Error>;
};
export const useHanzoNodeGetOptionsQuery = (
  options?: Omit<QueryObserverOptions, 'queryKey'>,
): UseQueryResult<HanzoNodeOptions, Error> => {
  const query = useQuery({
    queryKey: ['hanzo_node_get_options'],
    queryFn: (): Promise<HanzoNodeOptions> =>
      invoke('hanzo_node_get_options'),
    ...options,
  });
  return { ...query } as UseQueryResult<HanzoNodeOptions, Error>;
};
export const useHanzoNodeGetOllamaApiUrlQuery = (
  options?: Omit<QueryObserverOptions, 'queryKey'>,
): UseQueryResult<string, Error> => {
  const query = useQuery({
    queryKey: ['hanzo_node_get_ollama_api_url'],
    queryFn: (): Promise<string> => invoke('hanzo_node_get_ollama_api_url'),
    ...options,
  });
  return { ...query } as UseQueryResult<string, Error>;
};
export const useHanzoNodeGetDefaultModel = (
  options?: QueryObserverOptions,
): UseQueryResult<string, Error> => {
  const query = useQuery({
    queryKey: ['hanzo_node_get_default_model'],
    queryFn: (): Promise<string> => invoke('hanzo_node_get_default_model'),
    ...options,
  });
  return { ...query } as UseQueryResult<string, Error>;
};
export const useHanzoNodeGetOllamaVersionQuery = (
  options?: Omit<QueryObserverOptions, 'queryKey'>,
): UseQueryResult<string, Error> => {
  const query = useQuery({
    queryKey: ['hanzo_node_get_ollama_version'],
    queryFn: (): Promise<string> => invoke('hanzo_node_get_ollama_version'),
    ...options,
  });
  return { ...query } as UseQueryResult<string, Error>;
};

export const useHanzoNodeGetDefaultEmbeddingModelQuery = (
  options?: Omit<QueryObserverOptions, 'queryKey'>,
): UseQueryResult<string, Error> => {
  const query = useQuery({
    queryKey: ['hanzo_node_get_default_embedding_model'],
    queryFn: (): Promise<string> => invoke('hanzo_node_get_default_embedding_model'),
    staleTime: Infinity, // This is a static default value, never changes
    ...options,
  });
  return { ...query } as UseQueryResult<string, Error>;
};

// Mutations
export const useHanzoNodeSpawnMutation = (options?: UseMutationOptions) => {
  const queryClient = useQueryClient();
  const response = useMutation({
    mutationFn: () => {
      return invoke('hanzo_node_spawn');
    },
    ...options,
    onSuccess: (...onSuccessParameters) => {
      void queryClient.invalidateQueries({
        queryKey: ['hanzo_node_is_running'],
      });
      if (options?.onSuccess) {
        options.onSuccess(...onSuccessParameters);
      }
    },
  });
  return { ...response };
};

export const useHanzoNodeKillMutation = (options?: UseMutationOptions) => {
  const queryClient = useQueryClient();
  const response = useMutation({
    mutationFn: async (): Promise<void> => {
      return invoke('hanzo_node_kill');
    },
    ...options,
    onSuccess: (...onSuccessParameters) => {
      void queryClient.invalidateQueries({
        queryKey: ['hanzo_node_is_running'],
      });
      if (options?.onSuccess) {
        options.onSuccess(...onSuccessParameters);
      }
    },
  });
  return { ...response };
};

export type HanzoNodeRemoveStorageOptions = {
  preserveKeys: boolean;
};
export const useHanzoNodeRemoveStorageMutation = (
  options?: UseMutationOptions<
    void,
    Error,
    Partial<HanzoNodeRemoveStorageOptions>
  >,
) => {
  const response = useMutation({
    mutationFn: async (
      options: Partial<HanzoNodeRemoveStorageOptions>,
    ): Promise<void> => {
      await invoke('hanzo_node_set_default_options');
      return invoke('hanzo_node_remove_storage', {
        preserveKeys: options?.preserveKeys,
      });
    },
    ...options,
  });
  return { ...response };
};

export const useHanzoNodeSetOptionsMutation = (
  options?: UseMutationOptions<
    Partial<HanzoNodeOptions>,
    Error,
    HanzoNodeOptions
  >,
) => {
  const queryClient = useQueryClient();
  const response = useMutation({
    mutationFn: (
      hanzoNodeOptions: Partial<HanzoNodeOptions>,
    ): Promise<HanzoNodeOptions> => {
      return invoke('hanzo_node_set_options', {
        options: hanzoNodeOptions,
      });
    },
    ...options,
    onSuccess: (...onSuccessParameters) => {
      void queryClient.invalidateQueries({
        queryKey: ['hanzo_node_get_options'],
      });
      if (options?.onSuccess) {
        options.onSuccess(...onSuccessParameters);
      }
    },
  });
  return { ...response };
};

export const useHanzoNodeSetDefaultOptionsMutation = (
  options?: UseMutationOptions<HanzoNodeOptions, Error, void>,
) => {
  const queryClient = useQueryClient();
  const response = useMutation({
    mutationFn: (): Promise<HanzoNodeOptions> => {
      return invoke('hanzo_node_set_default_options', {});
    },
    ...options,
    onSuccess: (...onSuccessParameters) => {
      void queryClient.invalidateQueries({
        queryKey: ['hanzo_node_set_default_options'],
      });
      if (options?.onSuccess) {
        options.onSuccess(...onSuccessParameters);
      }
    },
  });
  return { ...response };
};

export const useHanzoNodeRespawnMutation = (options?: UseMutationOptions) => {
  const queryClient = useQueryClient();
  const response = useMutation({
    mutationFn: async () => {
      await invoke('hanzo_node_kill');
      await relaunch();
    },
    ...options,
    onSuccess: (...onSuccessParameters) => {
      void queryClient.invalidateQueries({
        queryKey: ['hanzo_node_is_running'],
      });
      if (options?.onSuccess) {
        options.onSuccess(...onSuccessParameters);
      }
    },
  });
  return { ...response };
};

export const useHanzoNodeSetDefaultLlmProviderMutation = (
  options?: UseMutationOptions<void, Error, string>,
) => {
  const response = useMutation({
    mutationFn: async (defaultLlmProvider: string): Promise<void> => {
      if (!defaultLlmProvider) {
        throw new Error('Default LLM provider is required');
      }
      return Promise.resolve();
    },
    ...options,
  });
  return { ...response };
};

export const hanzoNodeSetDefaultLlmProvider = async (
  defaultLlmProvider: string,
  nodeAddress: string,
  apiToken: string,
): Promise<void> => {
  if (!defaultLlmProvider || !nodeAddress || !apiToken) {
    throw new Error(
      'Default LLM provider, node address, and API token are required',
    );
  }

  await setPreferences(nodeAddress, apiToken, {
    default_llm_provider: defaultLlmProvider,
  });

  return Promise.resolve();
};
