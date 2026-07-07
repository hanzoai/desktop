import {
  allProviders,
  UsageStore,
  type ProviderDescriptor,
  type ProviderState,
  type RateWindow,
} from '@hanzo/usage';
import { useUsage } from '@hanzo/usage/react';
import { createTauriHost } from '@hanzo/usage/tauri';
import { useGetHanzoFreeModelQuota } from '@hanzo_network/hanzo-node-state/v2/queries/getHanzoFreeModelQuota/useGetHanzoFreeModelQuota';
import {
  Card,
  CardContent,
  Progress,
  Skeleton,
} from '@hanzo_network/hanzo-ui';
import { homeDir } from '@tauri-apps/api/path';
import * as fs from '@tauri-apps/plugin-fs';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import {
  formatDistanceToNow,
  formatDuration,
  intervalToDuration,
} from 'date-fns';
import { GaugeIcon, RefreshCwIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

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

const formatReset = (window: RateWindow): string | null => {
  if (window.resetsAt) {
    const date = new Date(window.resetsAt);
    if (!Number.isNaN(date.getTime())) {
      return `Resets ${formatDistanceToNow(date, { addSuffix: true })}`;
    }
  }
  return window.resetDescription ?? null;
};

const Lane = ({
  label,
  window,
}: {
  label: string;
  window?: RateWindow;
}) => {
  if (!window) return null;
  const used = Math.max(0, Math.min(100, Math.round(window.usedPercent)));
  const reset = formatReset(window);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-text-secondary">{label}</span>
        <span className="text-text-default text-xs">{used}% used</span>
      </div>
      <Progress
        className="h-2 rounded-full bg-cyan-900 [&>div]:bg-cyan-400"
        max={100}
        value={used}
      />
      {reset ? <p className="text-text-tertiary text-xs">{reset}</p> : null}
    </div>
  );
};

const ProviderCard = ({
  descriptor,
  state,
}: {
  descriptor: ProviderDescriptor;
  state?: ProviderState;
}) => {
  const meta = descriptor.metadata;
  const snapshot = state?.snapshot;
  const cost = snapshot?.providerCost;
  const identity = snapshot?.identity;
  const hasData = !!snapshot?.primary || !!snapshot?.secondary || !!cost;

  return (
    <Card className="bg-bg-secondary border-divider w-full rounded-lg p-0">
      <CardContent className="space-y-4 px-4 py-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              className="size-2.5 rounded-full"
              style={{ backgroundColor: meta.color ?? '#6b7280' }}
            />
            <div>
              <h3 className="text-base font-semibold">{meta.displayName}</h3>
              {identity?.plan || identity?.accountEmail ? (
                <p className="text-text-tertiary text-xs">
                  {[identity.plan, identity.accountEmail]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              ) : null}
            </div>
          </div>
          {state?.refreshing ? (
            <RefreshCwIcon className="text-text-tertiary size-3.5 animate-spin" />
          ) : null}
        </div>

        {state?.error ? (
          <p className="text-text-tertiary text-xs">
            Not connected — {state.error}
          </p>
        ) : hasData ? (
          <div className="space-y-3">
            <Lane label={meta.sessionLabel} window={snapshot?.primary} />
            <Lane label={meta.weeklyLabel} window={snapshot?.secondary} />
            {cost ? (
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-secondary">Spend</span>
                <span className="text-text-default text-xs">
                  {cost.currencyCode} {cost.used.toFixed(2)}
                  {cost.limit != null ? (
                    <span className="text-text-tertiary">
                      {' '}
                      / {cost.limit.toFixed(2)}
                    </span>
                  ) : null}
                </span>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-text-tertiary text-xs">
            No usage data yet. Sign in to {meta.displayName} locally to track
            limits here.
          </p>
        )}
      </CardContent>
    </Card>
  );
};

const ProviderGrid = ({ store }: { store: UsageStore }) => {
  const { providers } = useUsage(store);
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {allProviders.map((descriptor) => (
        <ProviderCard
          descriptor={descriptor}
          key={descriptor.id}
          state={providers[descriptor.id]}
        />
      ))}
    </div>
  );
};

const UsagePage = () => {
  const auth = useAuth((state) => state.auth);
  const [store, setStore] = useState<UsageStore | null>(null);
  const [hostUnavailable, setHostUnavailable] = useState(false);

  const { data: freeQuota, isPending: isFreeQuotaPending } =
    useGetHanzoFreeModelQuota(
      { nodeAddress: auth?.node_address ?? '', token: auth?.api_v2_key ?? '' },
      { enabled: !!auth },
    );

  useEffect(() => {
    let disposed = false;
    let created: UsageStore | null = null;
    void (async () => {
      if (!isTauriAvailable()) {
        setHostUnavailable(true);
        return;
      }
      try {
        const host = await createTauriHost({
          fs,
          fetch: tauriFetch,
          homeDir,
        });
        if (disposed) return;
        created = new UsageStore({ host, providers: allProviders });
        created.start();
        setStore(created);
      } catch {
        if (!disposed) setHostUnavailable(true);
      }
    })();
    return () => {
      disposed = true;
      created?.stop();
    };
  }, []);

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
            <ProviderGrid store={store} />
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
