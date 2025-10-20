import './globals.css';

import { zodResolver } from '@hookform/resolvers/zod';
import { PlayIcon, StopIcon } from '@radix-ui/react-icons';
import { useSyncOllamaModels } from '@hanzo_network/hanzo-node-state/v2/mutations/syncOllamaModels/useSyncOllamaModels';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Form,
  FormField,
  ScrollArea,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TextField,
  Toaster,
  Tooltip,
  TooltipContent,
  TooltipPortal,
  TooltipProvider,
  TooltipTrigger,
} from '@hanzo_network/hanzo-ui';
import { cn } from '@hanzo_network/hanzo-ui/utils';
import { QueryClientProvider } from '@tanstack/react-query';
import { info } from '@tauri-apps/plugin-log';
import { Loader2, RefreshCcwIcon, Trash2 } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';

import logo from '../../../src-tauri/icons/128x128@2x.png';
import { OllamaModels } from '../../components/hanzo-node-manager/ollama-models';
import { ALLOWED_OLLAMA_MODELS } from '../../lib/hanzo-node-manager/ollama-models';
import {
  hanzoNodeQueryClient,
  useHanzoNodeGetOptionsQuery,
  useHanzoNodeIsRunningQuery,
  useHanzoNodeKillMutation,
  useHanzoNodeRemoveStorageMutation,
  useHanzoNodeSetDefaultOptionsMutation,
  useHanzoNodeSetOptionsMutation,
  useHanzoNodeSpawnMutation,
} from '../../lib/hanzo-node-manager/hanzo-node-manager-client';
import { type HanzoNodeOptions } from '../../lib/hanzo-node-manager/hanzo-node-manager-client-types';
import { useHanzoNodeEventsToast } from '../../lib/hanzo-node-manager/hanzo-node-manager-hooks';
import {
  errorOllamaModelsSyncToast,
  errorRemovingHanzoNodeStorageToast,
  hanzoNodeStartedToast,
  hanzoNodeStartErrorToast,
  hanzoNodeStopErrorToast,
  hanzoNodeStoppedToast,
  startingHanzoNodeToast,
  stoppingHanzoNodeToast,
  successOllamaModelsSyncToast,
  successRemovingHanzoNodeStorageToast,
  successHanzoNodeSetDefaultOptionsToast,
} from '../../lib/hanzo-node-manager/hanzo-node-manager-toasts-utils';
import { useAuth } from '../../store/auth';
import { useHanzoNodeManager } from '../../store/hanzo-node-manager';
import { useSyncStorageSecondary } from '../../store/sync-utils';
import { Logs } from './components/logs';

const App = () => {
  useEffect(() => {
    void info('initializing hanzo-node-manager');
  }, []);
  useSyncStorageSecondary();
  const auth = useAuth((auth) => auth.auth);
  const setLogout = useAuth((auth) => auth.setLogout);
  const { setHanzoNodeOptions } = useHanzoNodeManager();
  const [isConfirmResetDialogOpened, setIsConfirmResetDialogOpened] =
    useState<boolean>(false);
  const { data: hanzoNodeIsRunning } = useHanzoNodeIsRunningQuery({
    refetchInterval: 1000,
  });
  const { data: hanzoNodeOptions } = useHanzoNodeGetOptionsQuery({
    refetchInterval: 1000,
  });

  const {
    isPending: hanzoNodeSpawnIsPending,
    mutateAsync: hanzoNodeSpawn,
  } = useHanzoNodeSpawnMutation({
    onMutate: () => {
      startingHanzoNodeToast();
    },
    onSuccess: () => {
      hanzoNodeStartedToast();
    },
    onError: () => {
      hanzoNodeStartErrorToast();
    },
  });
  const { isPending: hanzoNodeKillIsPending, mutateAsync: hanzoNodeKill } =
    useHanzoNodeKillMutation({
      onMutate: () => {
        stoppingHanzoNodeToast();
      },
      onSuccess: () => {
        hanzoNodeStoppedToast();
      },
      onError: () => {
        hanzoNodeStopErrorToast();
      },
    });
  const {
    isPending: hanzoNodeRemoveStorageIsPending,
    mutateAsync: hanzoNodeRemoveStorage,
  } = useHanzoNodeRemoveStorageMutation({
    onSuccess: async () => {
      successRemovingHanzoNodeStorageToast();
      setHanzoNodeOptions(null);
      setLogout();
    },
    onError: () => {
      errorRemovingHanzoNodeStorageToast();
    },
  });
  const { mutateAsync: hanzoNodeSetOptions } =
    useHanzoNodeSetOptionsMutation({
      onSuccess: (options) => {
        setHanzoNodeOptions(options);
      },
    });
  const { mutateAsync: hanzoNodeSetDefaultOptions } =
    useHanzoNodeSetDefaultOptionsMutation({
      onSuccess: (options) => {
        hanzoNodeOptionsForm.reset(options);
        successHanzoNodeSetDefaultOptionsToast();
      },
    });
  const hanzoNodeOptionsForm = useForm<Partial<HanzoNodeOptions>>({
    resolver: zodResolver(z.any()),
  });
  const hanzoNodeOptionsFormWatch = useWatch({
    control: hanzoNodeOptionsForm.control,
  });
  const {
    mutateAsync: syncOllamaModels,
    isPending: syncOllamaModelsIsPending,
  } = useSyncOllamaModels({
    onSuccess: () => {
      successOllamaModelsSyncToast();
    },
    onError: () => {
      errorOllamaModelsSyncToast();
    },
  });

  useHanzoNodeEventsToast();

  useEffect(() => {
    const options = {
      ...hanzoNodeOptions,
      ...hanzoNodeOptionsFormWatch,
    };
    void hanzoNodeSetOptions(options as HanzoNodeOptions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hanzoNodeOptionsFormWatch, hanzoNodeSetOptions]);

  const handleReset = (): void => {
    setIsConfirmResetDialogOpened(false);
    void hanzoNodeRemoveStorage({ preserveKeys: true });
  };

  const startSyncOllamaModels = async () => {
    await syncOllamaModels({
      nodeAddress: auth?.node_address ?? '',
      token: auth?.api_v2_key ?? '',
      allowedModels: ALLOWED_OLLAMA_MODELS,
    });
  };

  const [hanzoNodeOptionsForUI, setHanzoNodeOptionsForUI] =
    useState<Partial<HanzoNodeOptions>>();

  useEffect(() => {
    const filteredHanzoNodeOptionsKeys: (keyof HanzoNodeOptions)[] = [
      'secret_desktop_installation_proof_key',
    ];
    setHanzoNodeOptionsForUI(
      Object.fromEntries(
        Object.entries(hanzoNodeOptions ?? {}).filter(
          ([key]) =>
            !filteredHanzoNodeOptionsKeys.includes(
              key as keyof HanzoNodeOptions,
            ),
        ),
      ) as Partial<HanzoNodeOptions>,
    );
  }, [hanzoNodeOptions]);

  return (
    <div className="flex h-screen w-full flex-col space-y-2">
      <div
        className="absolute top-0 z-50 h-6 w-full"
        data-tauri-drag-region={true}
      />
      <div className="flex flex-row items-center p-4">
        <img alt="hanzo logo" className="h-10 w-10" src={logo} />
        <div className="ml-4 flex flex-col">
          <span className="text-lg">Local Hanzo Node</span>
          <span className="text-text-secondary text-sm">{`API URL: http://${hanzoNodeOptions?.node_api_ip}:${hanzoNodeOptions?.node_api_port}`}</span>
        </div>
        <div className="flex grow flex-row items-center justify-end space-x-4">
          <Tooltip>
            <TooltipTrigger>
              <Button
                disabled={
                  hanzoNodeSpawnIsPending ||
                  hanzoNodeKillIsPending ||
                  hanzoNodeIsRunning
                }
                onClick={() => {
                  console.log('spawning');
                  void hanzoNodeSpawn();
                }}
                variant={'outline'}
                size={'icon'}
              >
                {hanzoNodeSpawnIsPending || hanzoNodeKillIsPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <PlayIcon className="size-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipPortal>
              <TooltipContent side="bottom">
                <p>Start Hanzo Node</p>
              </TooltipContent>
            </TooltipPortal>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger>
              <Button
                disabled={
                  hanzoNodeSpawnIsPending ||
                  hanzoNodeKillIsPending ||
                  !hanzoNodeIsRunning
                }
                onClick={() => hanzoNodeKill()}
                variant={'outline'}
                size={'icon'}
              >
                {hanzoNodeKillIsPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <StopIcon className="size-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipPortal>
              <TooltipContent side="bottom">
                <p>Stop Hanzo Node</p>
              </TooltipContent>
            </TooltipPortal>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger>
              <Button
                disabled={hanzoNodeIsRunning}
                onClick={() => setIsConfirmResetDialogOpened(true)}
                variant={'outline'}
                size={'icon'}
              >
                {hanzoNodeRemoveStorageIsPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipPortal>
              <TooltipContent side="bottom">
                <p>Reset Hanzo Node</p>
              </TooltipContent>
            </TooltipPortal>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger>
              <Button
                disabled={!hanzoNodeIsRunning}
                onClick={() => startSyncOllamaModels()}
                variant={'outline'}
                size={'icon'}
              >
                {syncOllamaModelsIsPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCcwIcon className="size-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipPortal>
              <TooltipContent side="bottom">
                <p>Sync Ollama Models</p>
              </TooltipContent>
            </TooltipPortal>
          </Tooltip>
        </div>
      </div>

      <Tabs
        className="mt-4 flex h-full w-full flex-col overflow-hidden p-4"
        defaultValue="app-logs"
      >
        <TabsList className="flex h-10 w-fit items-center gap-2 rounded-full bg-transparent px-1 py-1">
          <TabsTrigger
            className={cn(
              'flex flex-col rounded-full px-4 py-1.5 text-base font-medium transition-colors',
              'data-[state=active]:bg-bg-quaternary data-[state=active]:text-text-default',
              'data-[state=inactive]:text-text-tertiary data-[state=inactive]:bg-transparent',
              'focus-visible:outline-hidden',
            )}
            value="app-logs"
          >
            App Logs
          </TabsTrigger>
          <TabsTrigger
            className={cn(
              'flex flex-col rounded-full px-4 py-1.5 text-base font-medium transition-colors',
              'data-[state=active]:bg-bg-quaternary data-[state=active]:text-text-default',
              'data-[state=inactive]:text-text-tertiary data-[state=inactive]:bg-transparent',
              'focus-visible:outline-hidden',
            )}
            value="options"
          >
            Options
          </TabsTrigger>
          <TabsTrigger
            className={cn(
              'flex flex-col rounded-full px-4 py-1.5 text-base font-medium transition-colors',
              'data-[state=active]:bg-bg-quaternary data-[state=active]:text-text-default',
              'data-[state=inactive]:text-text-tertiary data-[state=inactive]:bg-transparent',
              'focus-visible:outline-hidden',
            )}
            value="models"
          >
            Models
          </TabsTrigger>
        </TabsList>
        <TabsContent className="h-full overflow-hidden" value="app-logs">
          <Logs />
        </TabsContent>
        <TabsContent className="h-full overflow-hidden" value="options">
          <ScrollArea className="flex h-full flex-1 flex-col overflow-auto [&>div>div]:!block">
            <div className="flex flex-row justify-end pr-4">
              <Button
                className=""
                disabled={hanzoNodeIsRunning}
                onClick={() => hanzoNodeSetDefaultOptions()}
                variant={'outline'}
                size={'sm'}
              >
                Restore default
              </Button>
            </div>
            <div className="mt-2 h-full [&>div>div]:!block">
              <Form {...hanzoNodeOptionsForm}>
                <form className="space-y-2 pr-4">
                  {hanzoNodeOptionsForUI &&
                    Object.entries(hanzoNodeOptionsForUI).map(
                      ([key, value]) => {
                        return (
                          <FormField
                            control={hanzoNodeOptionsForm.control}
                            defaultValue={value}
                            disabled={hanzoNodeIsRunning}
                            key={key}
                            name={key as keyof HanzoNodeOptions}
                            render={({ field }) => (
                              <TextField
                                field={field}
                                label={<span className="uppercase">{key}</span>}
                              />
                            )}
                          />
                        );
                      },
                    )}
                </form>
              </Form>
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent className="h-full overflow-hidden pb-2" value="models">
          <OllamaModels />
        </TabsContent>
      </Tabs>
      <AlertDialog
        onOpenChange={setIsConfirmResetDialogOpened}
        open={isConfirmResetDialogOpened}
      >
        <AlertDialogContent className="w-[75%]">
          <AlertDialogHeader>
            <AlertDialogTitle>Reset your Hanzo Node</AlertDialogTitle>
            <AlertDialogDescription>
              <div className="flex flex-col space-y-3 text-left text-white/70">
                <div className="flex flex-col space-y-1">
                  <span className="text-sm">
                    Are you sure you want to reset your Hanzo Node? This will
                    permanently delete all your data.
                  </span>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4 flex justify-end gap-1">
            <AlertDialogCancel
              className="mt-0 min-w-[120px]"
              onClick={() => {
                setIsConfirmResetDialogOpened(false);
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="min-w-[120px]"
              onClick={() => handleReset()}
            >
              Reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

ReactDOM.createRoot(document.querySelector('#root') as HTMLElement).render(
  <QueryClientProvider client={hanzoNodeQueryClient}>
    <React.StrictMode>
      <TooltipProvider>
        <App />
        <Toaster />
      </TooltipProvider>
    </React.StrictMode>
  </QueryClientProvider>,
);
