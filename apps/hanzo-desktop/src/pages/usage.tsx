import { ProviderUsageGrid, useUsageDashboard } from '@hanzo/usage/react';
import { createTauriHost } from '@hanzo/usage/tauri';
import { useGetHanzoFreeModelQuota } from '@hanzo_network/hanzo-node-state/v2/queries/getHanzoFreeModelQuota/useGetHanzoFreeModelQuota';
import { Card, CardContent, Progress, Skeleton } from '@hanzo_network/hanzo-ui';
import { homeDir } from '@tauri-apps/api/path';
import * as fs from '@tauri-apps/plugin-fs';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { formatDuration, intervalToDuration } from 'date-fns';
import { GaugeIcon } from 'lucide-react';

import { BRAND } from '../config/brand';
import { useAuth } from '../store/auth';
import { isTauriAvailable } from '../utils/tauri-check';
import { SimpleLayout } from './layout/simple-layout';

const Section = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <div className="space-y-4">
    <h2 className="text-text-default text-base font-semibold">{title}</h2>
    {children}
  </div>
);

const UsagePage = () => {
  const auth = useAuth((state) => state.auth);

  // Provider grid + host lifecycle now come from the shared @hanzo/usage view —
  // the ONE Usage component every Hanzo surface renders (#75).
  const { store, hostUnavailable } = useUsageDashboard({
    createHost: () => createTauriHost({ fs, fetch: tauriFetch, homeDir }),
    available: isTauriAvailable,
  });

  const { data: freeQuota, isPending: isFreeQuotaPending } =
    useGetHanzoFreeModelQuota(
      { nodeAddress: auth?.node_address ?? '', token: auth?.api_v2_key ?? '' },
      { enabled: !!auth },
    );

  return (
    <SimpleLayout classname="max-w-4xl" title="Usage">
      <div className="flex flex-col gap-8 pb-10">
        {isFreeQuotaPending ? (
          <Skeleton className="h-[140px] w-full" />
        ) : freeQuota ? (
          <Section title={`Free ${BRAND.company} Usage`}>
            <Card className="bg-bg-secondary border-divider w-full rounded-lg p-0">
              <CardContent className="space-y-2 px-4 py-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-secondary">Tokens used</span>
                  <span className="text-text-default text-xs">
                    {freeQuota.usedTokens.toLocaleString()}{' '}
                    <span className="text-text-tertiary">
                      / {freeQuota.tokensQuota.toLocaleString()}
                    </span>
                  </span>
                </div>
                <Progress
                  className="h-2 rounded-full bg-cyan-900 [&>div]:bg-cyan-400"
                  max={100}
                  value={
                    freeQuota.tokensQuota
                      ? Math.min(
                          100,
                          (freeQuota.usedTokens / freeQuota.tokensQuota) * 100,
                        )
                      : 0
                  }
                />
                <p className="text-text-tertiary text-xs">
                  Your free limit resets in{' '}
                  {formatDuration(
                    intervalToDuration({
                      start: 0,
                      end: freeQuota.resetTime * 60 * 1000,
                    }),
                  )}
                </p>
              </CardContent>
            </Card>
          </Section>
        ) : null}

        <Section title="Providers">
          {store ? (
            <ProviderUsageGrid store={store} />
          ) : hostUnavailable ? (
            <Card className="bg-bg-secondary border-divider w-full rounded-lg p-0">
              <CardContent className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <GaugeIcon className="text-text-tertiary size-6" />
                <p className="text-text-default text-sm font-medium">
                  Connect your AI providers
                </p>
                <p className="text-text-tertiary max-w-sm text-xs">
                  Provider usage is tracked from the desktop app. Sign in to
                  Codex, Claude, or {BRAND.company} locally to see session and
                  weekly limits here.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Skeleton className="h-[160px] w-full" />
              <Skeleton className="h-[160px] w-full" />
            </div>
          )}
        </Section>
      </div>
    </SimpleLayout>
  );
};

export default UsagePage;
