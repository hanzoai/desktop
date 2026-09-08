import {
  type QueryObserverOptions,
  useMutation,
  useQuery,
  type UseQueryResult,
} from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';

// Mirrors `EngineInfo` in src-tauri/src/commands/engines.rs.
export type EngineInfo = {
  name: string;
  host: string;
  ip: string;
  port: number;
  models: string[];
  version: string | null;
  latency_ms: number | null;
  base_url: string;
};

export const engineQueryKeys = {
  discover: ['engines_discover'] as const,
};

// Browse the LAN (mDNS) for `hanzo serve` engines. ~3s; refetch on demand.
export const useDiscoverEnginesQuery = (
  options?: Partial<QueryObserverOptions<EngineInfo[], Error>>,
): UseQueryResult<EngineInfo[], Error> =>
  useQuery({
    ...options,
    queryKey: engineQueryKeys.discover,
    queryFn: async (): Promise<EngineInfo[]> => invoke('engines_discover'),
  });

// Health-check a base URL (GET <url>/v1/models). Powers manual entry and
// non-advertised engines (e.g. a remote cluster head).
export const useEngineProbeMutation = () =>
  useMutation<EngineInfo, Error, string>({
    mutationFn: async (url: string): Promise<EngineInfo> =>
      invoke('engine_probe', { url }),
  });
