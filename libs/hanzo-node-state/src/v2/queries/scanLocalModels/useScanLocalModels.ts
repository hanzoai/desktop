import { type QueryObserverOptions, useQuery } from '@tanstack/react-query';

import { FunctionKeyV2 } from '../../constants';
import { type ScanLocalModelsInput, type ScanLocalModelsOutput } from './types';
import { scanLocalModels } from '.';

type UseScanLocalModels = [
  FunctionKeyV2.SCAN_LOCAL_MODELS,
  ScanLocalModelsInput,
];

type Options = QueryObserverOptions<
  ScanLocalModelsOutput,
  Error,
  ScanLocalModelsOutput,
  ScanLocalModelsOutput,
  UseScanLocalModels
>;

export const useScanLocalModels = (
  input: ScanLocalModelsInput,
  options?: Omit<Options, 'queryKey' | 'queryFn'>,
) => {
  const response = useQuery({
    queryKey: [FunctionKeyV2.SCAN_LOCAL_MODELS, input],
    queryFn: async () => scanLocalModels(input),
    ...options,
  });
  return response;
};
