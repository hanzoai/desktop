import { useScanLocalModels } from '@hanzo_network/hanzo-node-state/v2/queries/scanLocalModels/useScanLocalModels';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ScrollArea,
} from '@hanzo_network/hanzo-ui';
import { cn } from '@hanzo_network/hanzo-ui/utils';
import { Database } from 'lucide-react';

import { ModelProvider } from '../ais/constants';
import ProviderIcon from '../ais/provider-icon';
import { useAuth } from '../../store/auth';
import {
  useHanzoNodeGetDefaultModel,
  useHanzoNodeIsRunningQuery,
} from '../../lib/hanzo-node-manager/hanzo-node-manager-client';

/**
 * Lists the models served by the local engine.
 *
 * The local engine is OpenAI-compatible and auto-discovers the models it serves
 * via `GET /v1/models`; there is no per-model "install"/"pull" step from the
 * desktop, so this is a read-only view of what is currently available locally.
 */
export const LocalModels = ({ className }: { className?: string }) => {
  const auth = useAuth((state) => state.auth);

  const { data: isRunning } = useHanzoNodeIsRunningQuery({
    refetchInterval: 5000,
  });
  const { data: defaultModel } = useHanzoNodeGetDefaultModel();
  const { data: localModels, isPending } = useScanLocalModels(
    { nodeAddress: auth?.node_address ?? '', token: auth?.api_v2_key ?? '' },
    { enabled: !!auth },
  );

  const models = localModels ?? [];

  return (
    <div className={cn('flex h-full flex-col', className)}>
      <ScrollArea className="flex-1">
        {models.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 pb-4 md:grid-cols-2">
            {models.map((model) => (
              <Card key={model.model} className="flex flex-col">
                <CardHeader className="flex flex-row items-center gap-3 p-4 pb-2">
                  <div className="flex h-7 w-7 items-center justify-center">
                    <ProviderIcon provider={ModelProvider.OpenAI} />
                  </div>
                  <div className="flex flex-col">
                    <CardTitle className="text-sm font-medium">
                      {model.name}
                    </CardTitle>
                    {model.model === defaultModel && (
                      <CardDescription className="text-text-secondary text-xs">
                        Default
                      </CardDescription>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="text-text-secondary px-4 pb-4 text-xs">
                  Served locally by the on-device engine.
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
            <Database className="text-text-secondary h-6 w-6" />
            <p className="text-text-secondary text-sm">
              {isPending
                ? 'Loading local models…'
                : isRunning
                  ? 'No local models available yet. The on-device engine serves models automatically once ready.'
                  : 'Start the local engine to see available models.'}
            </p>
          </div>
        )}
      </ScrollArea>
    </div>
  );
};

export default LocalModels;
