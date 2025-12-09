import { ReloadIcon } from '@radix-ui/react-icons';
import { useGetHealth } from '@hanzo_network/hanzo-node-state/v2/queries/getHealth/useGetHealth';
import { Button } from '@hanzo_network/hanzo-ui';
import { listen } from '@tauri-apps/api/event';
import { openPath } from '@tauri-apps/plugin-opener';
import { AlertCircle, DownloadIcon, Loader2 } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { ResetConnectionDialog } from '../components/reset-connection-dialog';
import { useAuth } from '../store/auth';
import { useHanzoNodeManager } from '../store/hanzo-node-manager';
import { useDownloadTauriLogsMutation } from './hanzo-logs/logs-client';
import { useHanzoNodeIsRunningQuery } from './hanzo-node-manager/hanzo-node-manager-client';
import { openHanzoNodeManagerWindow } from './hanzo-node-manager/hanzo-node-manager-windows-utils';

export const HanzoNodeRunningOverlay = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const auth = useAuth((store) => store.auth);
  const { data: isHanzoNodeRunning, isPending: isHanzoNodeRunningPending } =
    useHanzoNodeIsRunningQuery();
  const isInUse = useHanzoNodeManager((store) => store.isInUse);

  const {
    isSuccess: isHealthSuccess,
    data: health,
    isPending: isHealthPending,
    error: healthError,
    isError: isHealthError,
    refetch: refetchHealth,
  } = useGetHealth(
    { nodeAddress: auth?.node_address ?? '' },
    { refetchInterval: 35000 },
  );

  const { mutate: downloadTauriLogs } = useDownloadTauriLogsMutation({
    onSuccess: (result) => {
      toast.success('Logs downloaded successfully', {
        description: `You can find the logs file in your downloads folder`,
        action: {
          label: 'Open',
          onClick: async () => {
            await openPath(result.savePath);
          },
        },
      });
    },
    onError: (error) => {
      toast.error('Failed to download logs', {
        description: error.message,
      });
    },
  });

  const [isResetConnectionDialogOpen, setIsResetConnectionDialogOpen] =
    useState(false);

  const isHanzoNodeHealthy = isHealthSuccess && health.status === 'ok';

  useEffect(() => {
    const handleFocus = () => {
      void refetchHealth();
    };

    const unlistenPromise = listen('tauri://focus', handleFocus);

    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [auth?.node_address, refetchHealth]);

  if (isHealthPending || isHanzoNodeRunningPending) {
    return (
      <div className="flex size-full flex-col items-center justify-center gap-3 py-8">
        <Loader2 className="h-8 w-8 animate-spin text-white" />
        <span className="text-text-secondary text-sm">
          Checking Hanzo Node Status ...
        </span>
      </div>
    );
  }

  if (isHealthError && !isHanzoNodeRunning && isInUse) {
    return (
      <div className="flex size-full flex-col items-center justify-center gap-6 px-8">
        <div className="flex max-w-lg flex-col items-center gap-4 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-red-500/10">
            <AlertCircle className="size-6 text-red-400" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold">
              Connection Issue Detected
            </h1>
            <p className="text-text-secondary text-base">
              We're unable to connect to your Hanzo node. Simply start or
              reconnect to your node to continue.
            </p>
          </div>
        </div>
        <Button
          onClick={async () => {
            await openHanzoNodeManagerWindow();
          }}
          size="md"
          className="min-w-[160px]"
          type="button"
        >
          Open Hanzo Node Manager
        </Button>
      </div>
    );
  }

  if (isHanzoNodeHealthy && !!auth) {
    return children;
  }

  return (
    <div className="flex size-full items-center justify-center">
      <div
        className="flex flex-col items-center gap-6 px-3 py-4 text-sm"
        role="alert"
      >
        <div className="space-y-2 text-center text-red-400">
          <p>Unable to connect to Hanzo Node.</p>
          <pre className="px-4 whitespace-break-spaces">
            {healthError?.message ?? 'Unknown error'}
          </pre>
        </div>
        <div className="flex items-center gap-4">
          <Button
            className="min-w-[140px]"
            onClick={() => {
              downloadTauriLogs();
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            <DownloadIcon className="size-3.5" />
            Download Logs
          </Button>
          <Button
            className="min-w-[140px]"
            onClick={() => setIsResetConnectionDialogOpen(true)}
            size="sm"
            type="button"
          >
            <ReloadIcon className="size-3.5" />
            Reset App
          </Button>
          <ResetConnectionDialog
            allowClose
            isOpen={isResetConnectionDialogOpen}
            onOpenChange={setIsResetConnectionDialogOpen}
          />
        </div>
      </div>
    </div>
  );
};
