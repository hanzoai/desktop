import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (cmd: string, args?: unknown) => invokeMock(cmd, args),
}));

const addLLMProviderMock = vi.fn().mockResolvedValue({});
vi.mock(
  '@hanzo_network/hanzo-node-state/v2/mutations/addLLMProvider/useAddLLMProvider',
  () => ({
    useAddLLMProvider: (opts?: { onSuccess?: () => void }) => ({
      mutateAsync: async (vars: unknown) => {
        const out = await addLLMProviderMock(vars);
        opts?.onSuccess?.();
        return out;
      },
      isPending: false,
    }),
  }),
);

vi.mock('@hanzo_network/hanzo-node-state/lib/utils/models', () => ({
  Models: { OpenAI: 'open-ai' },
}));
vi.mock('@hanzo_network/hanzo-node-state/v2/constants', () => ({
  FunctionKeyV2: { GET_LLM_PROVIDERS: 'GET_LLM_PROVIDERS' },
}));
vi.mock('../../../pages/add-ai', () => ({
  getModelObject: (model: string, modelType: string) => ({
    [model]: { model_type: modelType },
  }),
}));
vi.mock('../../../store/auth', () => ({
  useAuth: (selector: (s: unknown) => unknown) =>
    selector({
      auth: {
        node_address: 'http://node',
        api_v2_key: 'key',
        hanzo_identity: '@@id',
        profile: 'main',
      },
    }),
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('@hanzo_network/hanzo-ui', () => ({
  Button: ({ children, ...props }: React.ComponentProps<'button'>) => (
    <button {...props}>{children}</button>
  ),
  Input: (props: React.ComponentProps<'input'>) => <input {...props} />,
}));

import { useSettings } from '../../../store/settings';
import LocalNetworkEngines from '../local-network-engines';

const engine = {
  name: 'evo',
  host: 'evo.local',
  ip: '10.0.0.144',
  port: 1240,
  models: ['Qwen3-0.6B'],
  version: '1.7.18',
  latency_ms: 3,
  base_url: 'http://10.0.0.144:1240/v1',
};

const renderPage = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <LocalNetworkEngines />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  invokeMock.mockReset();
  addLLMProviderMock.mockClear();
  useSettings.setState({ selectedEngineBaseUrl: '', defaultAgentId: '' });
});

describe('LocalNetworkEngines', () => {
  it('renders discovered engines and selecting one registers a provider + persists the base URL', async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'engines_discover') return [engine];
      throw new Error('unexpected: ' + cmd);
    });

    renderPage();

    // Engine appears in discovery (name + models rendered).
    expect(await screen.findByText('evo')).toBeInTheDocument();
    expect(screen.getByText(/Qwen3-0\.6B/)).toBeInTheDocument();

    // Select it.
    fireEvent.click(screen.getByRole('button', { name: 'Use' }));

    await waitFor(() =>
      expect(addLLMProviderMock).toHaveBeenCalledWith(
        expect.objectContaining({
          nodeAddress: 'http://node',
          agent: expect.objectContaining({
            external_url: 'http://10.0.0.144:1240/v1',
            model: { 'open-ai': { model_type: 'Qwen3-0.6B' } },
          }),
        }),
      ),
    );

    // Chat backend base URL persisted in the settings store.
    expect(useSettings.getState().selectedEngineBaseUrl).toBe(
      'http://10.0.0.144:1240/v1',
    );
  });

  it('adds a manually entered engine URL via engine_probe', async () => {
    invokeMock.mockImplementation(async (cmd: string, args?: unknown) => {
      if (cmd === 'engines_discover') return [];
      if (cmd === 'engine_probe') {
        expect(args).toEqual({ url: 'http://localhost:1234' });
        return { ...engine, name: 'localhost', base_url: 'http://localhost:1234/v1' };
      }
      throw new Error('unexpected: ' + cmd);
    });

    renderPage();

    const input = await screen.findByPlaceholderText(/192\.168/);
    fireEvent.change(input, { target: { value: 'http://localhost:1234' } });
    fireEvent.click(screen.getByRole('button', { name: /Add engine URL/ }));

    await waitFor(() =>
      expect(addLLMProviderMock).toHaveBeenCalledWith(
        expect.objectContaining({
          agent: expect.objectContaining({
            external_url: 'http://localhost:1234/v1',
          }),
        }),
      ),
    );
    expect(useSettings.getState().selectedEngineBaseUrl).toBe(
      'http://localhost:1234/v1',
    );
  });
});
