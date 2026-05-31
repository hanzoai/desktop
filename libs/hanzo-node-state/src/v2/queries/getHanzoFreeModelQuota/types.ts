import { type Token } from '@hanzo_network/hanzo-message-ts/api/general/types';
import { type QueryObserverOptions } from '@tanstack/react-query';

import { type FunctionKeyV2 } from '../../constants';

export type GetHanzoFreeModelQuotaInput = Token & {
  nodeAddress: string;
};
export type UseGetHanzoFreeModelQuota = [
  FunctionKeyV2.GET_HANZO_FREE_MODEL_QUOTA,
  GetHanzoFreeModelQuotaInput,
];
// Cloud free-tier is retired (local-only). The query resolves to `null` and the
// "Free Hanzo AI Usage" UI is simply not rendered.
export type GetHanzoFreeModelQuotaOutput = {
  hasQuota: boolean;
  remainingMessages: number;
  totalMessages: number;
  resetTime: number;
  usedTokens: number;
  tokensQuota: number;
} | null;

export type Options = QueryObserverOptions<
  GetHanzoFreeModelQuotaOutput,
  Error,
  GetHanzoFreeModelQuotaOutput,
  GetHanzoFreeModelQuotaOutput,
  UseGetHanzoFreeModelQuota
>;
