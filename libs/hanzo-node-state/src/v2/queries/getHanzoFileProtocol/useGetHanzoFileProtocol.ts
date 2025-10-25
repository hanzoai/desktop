import { type QueryObserverOptions, useQuery } from '@tanstack/react-query';

import { FunctionKeyV2 } from '../../constants';
import {
  type GetHanzoFileProtocolInput,
  type GetHanzoFileProtocolOutput,
} from './types';
import { getHanzoFileProtocol } from './index';

export type UseGetHanzoFileProtocol = [
  FunctionKeyV2.GET_HANZO_FILE_PROTOCOL,
  GetHanzoFileProtocolInput,
];
type Options = QueryObserverOptions<
  GetHanzoFileProtocolOutput,
  Error,
  GetHanzoFileProtocolOutput,
  GetHanzoFileProtocolOutput,
  UseGetHanzoFileProtocol
>;

export const useGetHanzoFileProtocol = (
  input: GetHanzoFileProtocolInput,
  options?: Omit<Options, 'queryKey' | 'queryFn'>,
) => {
  const response = useQuery({
    queryKey: [FunctionKeyV2.GET_HANZO_FILE_PROTOCOL, input],
    queryFn: () => getHanzoFileProtocol(input),
    ...options,
  });
  return response;
};
