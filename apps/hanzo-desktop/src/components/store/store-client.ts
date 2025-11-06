import { type QueryObserverOptions, useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';

export const storeKeys = {
  all: ['store'] as const,
  agents: () => [...storeKeys.all, 'agents'] as const,
  tools: () => [...storeKeys.all, 'tools'] as const,
};

export interface StoreProduct {
  id: string;
  name: string;
  author: string;
  description: string;
  homepage: string;
  downloads: number;
  icon: string;
  category: string;
  type: string;
  version: string;
  license: string;
  tags: string[];
}

export type FormattedStoreAgent = {
  id: string;
  name: string;
  description: string;
  author: string;
  downloads: number;
  iconUrl: string;
  routerKey: string;
  category: {
    name: string;
  };
};

export type FormattedStoreTool = {
  id: string;
  name: string;
  description: string;
  author: string;
  downloads: number;
  iconUrl: string;
  routerKey: string;
  category: {
    name: string;
  };
  version: string;
  license: string;
  tags: string[];
};

export type UseGetStoreAgents = ReturnType<typeof storeKeys.agents>;
export type GetStoreAgentsOutput = FormattedStoreAgent[];

export type UseGetStoreAgentsOptions = QueryObserverOptions<
  GetStoreAgentsOutput,
  Error,
  GetStoreAgentsOutput,
  GetStoreAgentsOutput,
  UseGetStoreAgents
>;

export type UseGetStoreTools = ReturnType<typeof storeKeys.tools>;
export type GetStoreToolsOutput = FormattedStoreTool[];

export type UseGetStoreToolsOptions = QueryObserverOptions<
  GetStoreToolsOutput,
  Error,
  GetStoreToolsOutput,
  GetStoreToolsOutput,
  UseGetStoreTools
>;

const getStoreAgents = async (): Promise<FormattedStoreAgent[]> => {
  const res = await invoke<{
    status: number;
    headers: Record<string, string[]>;
    body: string;
  }>('get_request', {
    url: 'http://store.hanzo.ai/store.json',
    customHeaders: JSON.stringify({}),
  });

  if (res.status !== 200) {
    throw new Error(`Request failed: ${res.status}`);
  }

  const data = JSON.parse(res.body) as { apps: StoreProduct[] };

  // Filter to only agents and map the data
  return data.apps
    .filter((item) => item.type === 'Agent')
    .map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      author: item.author,
      downloads: item.downloads,
      iconUrl: item.icon,
      routerKey: item.homepage,
      category: {
        name: item.category,
      },
    }));
};

export const useGetStoreAgents = (
  options?: Omit<UseGetStoreAgentsOptions, 'queryKey' | 'queryFn'>,
) => {
  return useQuery({
    queryKey: storeKeys.agents(),
    queryFn: () => getStoreAgents(),
    ...options,
  });
};

const getStoreTools = async (): Promise<FormattedStoreTool[]> => {
  const res = await invoke<{
    status: number;
    headers: Record<string, string[]>;
    body: string;
  }>('get_request', {
    url: 'http://store.hanzo.ai/store.json',
    customHeaders: JSON.stringify({}),
  });

  if (res.status !== 200) {
    throw new Error(`Request failed: ${res.status}`);
  }

  const data = JSON.parse(res.body) as { apps: StoreProduct[] };

  // Filter to only tools and map the data
  return data.apps
    .filter((item) => item.type === 'Tool')
    .map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      author: item.author,
      downloads: item.downloads,
      iconUrl: item.icon,
      routerKey: item.homepage,
      category: {
        name: item.category,
      },
      version: item.version,
      license: item.license,
      tags: item.tags,
    }));
};

export const useGetStoreTools = (
  options?: Omit<UseGetStoreToolsOptions, 'queryKey' | 'queryFn'>,
) => {
  return useQuery({
    queryKey: storeKeys.tools(),
    queryFn: () => getStoreTools(),
    ...options,
  });
};
