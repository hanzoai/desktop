import { useMutation, type UseMutationOptions } from '@tanstack/react-query';

import type { PublishAgentResponse } from '@hanzo_network/hanzo-message-ts/api/agents/types';

import type { APIError } from '../../types';

import { publishAgent, type PublishAgentInput } from '.';

type Options = UseMutationOptions<
  PublishAgentResponse,
  APIError,
  PublishAgentInput
>;

export const usePublishAgent = (options?: Options) => {
  return useMutation({
    mutationFn: publishAgent,
    ...options,
  });
};
