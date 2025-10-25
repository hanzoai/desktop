import { useQuery } from '@tanstack/react-query';

import { FunctionKeyV2 } from '../../constants';
import { type GetHanzoFreeModelQuotaInput, type Options } from './types';
import { getHanzoFreeModelQuota } from '.';

export const useGetHanzoFreeModelQuota = (
  input: GetHanzoFreeModelQuotaInput,
  options?: Omit<Options, 'queryKey' | 'queryFn'>,
) => {
  const response = useQuery({
    queryKey: [FunctionKeyV2.GET_HANZO_FREE_MODEL_QUOTA, input] as const,
    queryFn: async () => await getHanzoFreeModelQuota(input),
    ...options,
  });
  return response;
};
