import { Models } from '@hanzo_network/hanzo-node-state/lib/utils/models';
import { FunctionKeyV2 } from '@hanzo_network/hanzo-node-state/v2/constants';
import { useAddLLMProvider } from '@hanzo_network/hanzo-node-state/v2/mutations/addLLMProvider/useAddLLMProvider';
import { Button, Input } from '@hanzo_network/hanzo-ui';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, RefreshCw, Wifi } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import {
  type EngineInfo,
  useDiscoverEnginesQuery,
  useEngineProbeMutation,
} from '../../lib/engines/engines-client';
import { getModelObject } from '../../pages/add-ai';
import { useAuth } from '../../store/auth';
import { useSettings } from '../../store/settings';

const providerId = (engine: EngineInfo) =>
  `local_${engine.name}_${engine.port}`.replace(/[^a-zA-Z0-9_]/g, '_');

const LocalNetworkEngines = () => {
  const auth = useAuth((state) => state.auth);
  const setSelectedEngineBaseUrl = useSettings(
    (state) => state.setSelectedEngineBaseUrl,
  );
  const setDefaultAgentId = useSettings((state) => state.setDefaultAgentId);
  const queryClient = useQueryClient();

  const {
    data: engines,
    isFetching,
    refetch,
  } = useDiscoverEnginesQuery();
  const probe = useEngineProbeMutation();
  const [manualUrl, setManualUrl] = useState('');

  const { mutateAsync: addLLMProvider, isPending } = useAddLLMProvider({
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [FunctionKeyV2.GET_LLM_PROVIDERS],
      });
    },
  });

  const selectEngine = async (engine: EngineInfo) => {
    if (!auth) return;
    const id = providerId(engine);
    try {
      await addLLMProvider({
        nodeAddress: auth.node_address,
        token: auth.api_v2_key,
        agent: {
          api_key: '',
          external_url: engine.base_url,
          full_identity_name: `${auth.hanzo_identity}/${auth.profile}/agent/${id}`,
          id,
          model: getModelObject(Models.OpenAI, engine.models[0] ?? 'default'),
          name: engine.name,
        },
      });
      setSelectedEngineBaseUrl(engine.base_url);
      setDefaultAgentId(id);
      toast.success(`Using ${engine.name}`, { description: engine.base_url });
    } catch (error) {
      toast.error('Failed to add engine', { description: String(error) });
    }
  };

  const addManual = async () => {
    const url = manualUrl.trim();
    if (!url) return;
    try {
      const info = await probe.mutateAsync(url);
      await selectEngine(info);
      setManualUrl('');
    } catch (error) {
      toast.error('Could not reach engine', { description: String(error) });
    }
  };

  return (
    <div className="border-official-gray-780 rounded-lg border p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wifi className="h-4 w-4" />
          <h2 className="text-sm font-medium">Local Network</h2>
          {engines?.length ? (
            <span className="text-text-secondary text-xs">
              {engines.length} found
            </span>
          ) : null}
        </div>
        <Button
          disabled={isFetching}
          onClick={() => refetch()}
          size="xs"
          variant="outline"
        >
          {isFetching ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          Refresh
        </Button>
      </div>

      {engines?.length ? (
        <ul className="flex flex-col gap-2" data-testid="discovered-engines">
          {engines.map((engine) => (
            <li
              className="border-official-gray-800 flex items-center justify-between gap-3 rounded-md border px-3 py-2"
              data-testid="discovered-engine"
              key={engine.base_url}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">
                    {engine.name}
                  </span>
                  {engine.version ? (
                    <span className="text-text-secondary text-xs">
                      v{engine.version}
                    </span>
                  ) : null}
                  {engine.latency_ms != null ? (
                    <span className="text-text-secondary text-xs">
                      {engine.latency_ms}ms
                    </span>
                  ) : null}
                </div>
                <div className="text-text-secondary truncate text-xs">
                  {engine.base_url}
                  {engine.models.length ? ` - ${engine.models.join(', ')}` : ''}
                </div>
              </div>
              <Button
                disabled={isPending}
                onClick={() => selectEngine(engine)}
                size="xs"
              >
                Use
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-text-secondary text-xs">
          {isFetching
            ? 'Scanning...'
            : 'No engines found on your network.'}
        </p>
      )}

      <div className="mt-3 flex items-center gap-2">
        <Input
          className="h-8 text-sm"
          onChange={(event) => setManualUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void addManual();
          }}
          placeholder="http://192.168.1.10:1234"
          value={manualUrl}
        />
        <Button
          disabled={probe.isPending || !manualUrl.trim()}
          onClick={addManual}
          size="sm"
          variant="outline"
        >
          {probe.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Plus className="h-3 w-3" />
          )}
          Add engine URL
        </Button>
      </div>
    </div>
  );
};

export default LocalNetworkEngines;
