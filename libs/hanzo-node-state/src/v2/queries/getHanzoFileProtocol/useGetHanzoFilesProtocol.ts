import { type QueryObserverOptions, useQuery } from '@tanstack/react-query';

import { FunctionKeyV2 } from '../../constants';
import {
  type GetHanzoFilesProtocolInput,
  type GetHanzoFilesProtocolOutput,
} from './types';
import { getHanzoFilesProtocol } from './index';

export type UseGetHanzoFilesProtocol = [
  FunctionKeyV2.GET_SHINKAI_FILE_PROTOCOLS,
  GetHanzoFilesProtocolInput,
];
type Options = QueryObserverOptions<
  GetHanzoFilesProtocolOutput,
  Error,
  GetHanzoFilesProtocolOutput,
  GetHanzoFilesProtocolOutput,
  UseGetHanzoFilesProtocol
>;

export const useGetHanzoFilesProtocol = (
  input: GetHanzoFilesProtocolInput,
  options?: Omit<Options, 'queryKey' | 'queryFn'>,
) => {
  const response = useQuery({
    queryKey: [FunctionKeyV2.GET_SHINKAI_FILE_PROTOCOLS, input],
    queryFn: () => getHanzoFilesProtocol(input),
    ...options,
  });
  return response;
};
