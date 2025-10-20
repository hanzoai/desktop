import { getHanzoFreeModelQuota as getHanzoFreeModelQuotaApi } from '@hanzo_network/hanzo-message-ts/api/general/index';
import { type GetHanzoFreeModelQuotaResponse } from '@hanzo_network/hanzo-message-ts/api/general/types';

import {
  type GetHanzoFreeModelQuotaInput,
  type GetHanzoFreeModelQuotaOutput,
} from './types';

const TOKENS_PER_MESSAGE = 2000;

const parseQuotaToMessages = (quota: GetHanzoFreeModelQuotaResponse) => {
  const totalMessages = Math.floor(quota.tokens_quota / TOKENS_PER_MESSAGE);
  const usedMessages = Math.floor(quota.used_tokens / TOKENS_PER_MESSAGE);
  const remainingMessages = totalMessages - usedMessages;

  return {
    remainingMessages,
    totalMessages,
    resetTime: quota.reset_time,
    hasQuota: quota.has_quota,
    usedTokens: quota.used_tokens,
    tokensQuota: quota.tokens_quota,
  };
};

export const getHanzoFreeModelQuota = async ({
  nodeAddress,
  token,
}: GetHanzoFreeModelQuotaInput): Promise<GetHanzoFreeModelQuotaOutput> => {
  const response = await getHanzoFreeModelQuotaApi(nodeAddress, token);
  const parsedResponse = parseQuotaToMessages(response);
  return parsedResponse;
};
