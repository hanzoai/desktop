/**
 * Hanzo Engine React Hooks
 *
 * React Query hooks for interacting with the embedded Hanzo Engine.
 * These provide caching, automatic refetching, and optimistic updates.
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
  type UseMutationOptions,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { hanzoEngine, HanzoEngineClient } from './client';
import type {
  EngineStatus,
  LoadModelOptions,
  ChatMessage,
  ChatCompletionResponse,
  ModelsResponse,
  EmbeddingResponse,
} from './types';

// Query Keys
export const engineQueryKeys = {
  all: ['hanzo-engine'] as const,
  status: () => [...engineQueryKeys.all, 'status'] as const,
  models: () => [...engineQueryKeys.all, 'models'] as const,
};

/**
 * Hook to get engine status
 */
export function useEngineStatus(
  options?: Omit<UseQueryOptions<EngineStatus, Error>, 'queryKey' | 'queryFn'>
): UseQueryResult<EngineStatus, Error> {
  return useQuery({
    queryKey: engineQueryKeys.status(),
    queryFn: () => hanzoEngine.getStatus(),
    refetchInterval: 5000, // Poll every 5 seconds
    ...options,
  });
}

/**
 * Hook to list available models
 */
export function useEngineModels(
  options?: Omit<UseQueryOptions<ModelsResponse, Error>, 'queryKey' | 'queryFn'>
): UseQueryResult<ModelsResponse, Error> {
  return useQuery({
    queryKey: engineQueryKeys.models(),
    queryFn: () => hanzoEngine.listModels(),
    ...options,
  });
}

/**
 * Hook to check if engine is available
 */
export function useEngineAvailable(
  options?: Omit<UseQueryOptions<boolean, Error>, 'queryKey' | 'queryFn'>
): UseQueryResult<boolean, Error> {
  return useQuery({
    queryKey: [...engineQueryKeys.all, 'available'],
    queryFn: () => hanzoEngine.isAvailable(),
    refetchInterval: 10000, // Poll every 10 seconds
    ...options,
  });
}

/**
 * Hook to load a model
 */
export function useLoadModel(
  options?: UseMutationOptions<void, Error, LoadModelOptions>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (modelOptions: LoadModelOptions) =>
      hanzoEngine.loadModel(modelOptions),
    onSuccess: () => {
      // Invalidate status and models queries
      queryClient.invalidateQueries({ queryKey: engineQueryKeys.status() });
      queryClient.invalidateQueries({ queryKey: engineQueryKeys.models() });
    },
    ...options,
  });
}

/**
 * Hook to unload the current model
 */
export function useUnloadModel(
  options?: UseMutationOptions<void, Error, void>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => hanzoEngine.unloadModel(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: engineQueryKeys.status() });
      queryClient.invalidateQueries({ queryKey: engineQueryKeys.models() });
    },
    ...options,
  });
}

/**
 * Hook for chat completion (non-streaming)
 */
export function useChat(
  options?: UseMutationOptions<
    ChatCompletionResponse,
    Error,
    { messages: ChatMessage[]; model?: string; temperature?: number; max_tokens?: number }
  >
) {
  return useMutation({
    mutationFn: ({ messages, model, temperature, max_tokens }) =>
      hanzoEngine.chat(messages, model, { temperature, max_tokens }),
    ...options,
  });
}

/**
 * Hook for embeddings generation
 */
export function useEmbeddings(
  options?: UseMutationOptions<
    EmbeddingResponse,
    Error,
    { input: string | string[]; model?: string }
  >
) {
  return useMutation({
    mutationFn: ({ input, model }) => hanzoEngine.embeddings(input, model),
    ...options,
  });
}

/**
 * Hook for streaming chat completion
 * Returns streaming state and a function to start streaming
 */
export function useStreamingChat() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [content, setContent] = useState('');
  const [error, setError] = useState<Error | null>(null);

  const startStream = useCallback(
    async (
      messages: ChatMessage[],
      model?: string,
      options?: { temperature?: number; max_tokens?: number; onChunk?: (chunk: string) => void }
    ) => {
      setIsStreaming(true);
      setContent('');
      setError(null);

      try {
        let fullContent = '';
        for await (const chunk of hanzoEngine.streamChat(messages, model, options)) {
          fullContent += chunk;
          setContent(fullContent);
          options?.onChunk?.(chunk);
        }
        return fullContent;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      } finally {
        setIsStreaming(false);
      }
    },
    []
  );

  const reset = useCallback(() => {
    setContent('');
    setError(null);
  }, []);

  return {
    isStreaming,
    content,
    error,
    startStream,
    reset,
  };
}

/**
 * Combined hook for checking engine readiness
 * Returns true when engine is available and has a model loaded
 */
export function useEngineReady(): {
  isReady: boolean;
  isAvailable: boolean;
  hasModel: boolean;
  status: EngineStatus | undefined;
  isLoading: boolean;
} {
  const { data: status, isLoading } = useEngineStatus();

  return {
    isReady: !isLoading && !!status?.initialized,
    isAvailable: !isLoading && status !== undefined,
    hasModel: !!status?.loaded_model,
    status,
    isLoading,
  };
}

/**
 * Hook that provides a complete engine interface
 * Combines status, loading, and chat functionality
 */
export function useHanzoEngine() {
  const statusQuery = useEngineStatus();
  const modelsQuery = useEngineModels();
  const loadModelMutation = useLoadModel();
  const unloadModelMutation = useUnloadModel();
  const chatMutation = useChat();
  const streaming = useStreamingChat();

  return {
    // Status
    status: statusQuery.data,
    isLoading: statusQuery.isLoading,
    isError: statusQuery.isError,
    error: statusQuery.error,

    // Model state
    isInitialized: statusQuery.data?.initialized ?? false,
    loadedModel: statusQuery.data?.loaded_model ?? null,
    device: statusQuery.data?.device ?? 'unknown',
    isBusy: statusQuery.data?.is_busy ?? false,

    // Models list
    models: modelsQuery.data?.data ?? [],

    // Actions
    loadModel: loadModelMutation.mutateAsync,
    isLoadingModel: loadModelMutation.isPending,
    loadModelError: loadModelMutation.error,

    unloadModel: unloadModelMutation.mutateAsync,
    isUnloading: unloadModelMutation.isPending,

    // Chat
    chat: chatMutation.mutateAsync,
    isChatting: chatMutation.isPending,
    chatError: chatMutation.error,

    // Streaming
    streamChat: streaming.startStream,
    isStreaming: streaming.isStreaming,
    streamContent: streaming.content,
    streamError: streaming.error,
    resetStream: streaming.reset,

    // Refresh
    refetch: () => {
      statusQuery.refetch();
      modelsQuery.refetch();
    },
  };
}
