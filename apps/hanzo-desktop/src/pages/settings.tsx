import { zodResolver } from '@hookform/resolvers/zod';
import { getBrand } from '@hanzo/desktop-brand-config';
import {
  type LocaleMode,
  localeOptions,
  useTranslation,
} from '@hanzo/desktop-i18n';
import { isHanzoIdentityLocalhost } from '@hanzo/desktop-message-ts/utils/inbox_name_handler';

import { useSetMaxChatIterations } from '@hanzo/desktop-node-state/v2/mutations/setMaxChatIterations/useSetMaxChatIterations';

import { useGetHealth } from '@hanzo/desktop-node-state/v2/queries/getHealth/useGetHealth';
import { useGetLLMProviders } from '@hanzo/desktop-node-state/v2/queries/getLLMProviders/useGetLLMProviders';
import { useGetPreferences } from '@hanzo/desktop-node-state/v2/queries/getPreferences/useGetPreferences';
import { useGetHanzoFreeModelQuota } from '@hanzo/desktop-node-state/v2/queries/getHanzoFreeModelQuota/useGetHanzoFreeModelQuota';

import {
  Badge,
  Button,
  buttonVariants,
  Card,
  CardContent,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Progress,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Switch,
  TextField,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@hanzo/desktop-ui';
import { useDebounce } from '@hanzo/desktop-ui/hooks';
import { cn } from '@hanzo/desktop-ui/utils';
import { getVersion } from '@tauri-apps/api/app';
import { formatDuration, intervalToDuration } from 'date-fns';
import {
  InfoIcon,
  RefreshCw,
  CheckCircle,
  ShieldCheckIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { FeedbackModal } from '../components/feedback/feedback-modal';
import { OnboardingStep } from '../components/onboarding/constants';
import EmbeddingModelSelectionDialog from '../components/settings/embedding-model-selection-dialog';
import HanzoIdentityDialog from '../components/settings/hanzo-identity-dialog';
import {
  useCheckUpdateQuery,
  useDownloadUpdateMutation,
  useUpdateStateQuery,
} from '../lib/updater/updater-client';
import { useGpuConnect } from '../hooks/useGpuConnect';
import { useAuth } from '../store/auth';
import { useSettings } from '../store/settings';
import { SimpleLayout } from './layout/simple-layout';

const formSchema = z.object({
  defaultAgentId: z.string(),
  displayActionButton: z.boolean(),
  nodeAddress: z.string(),
  optInAnalytics: z.boolean(),
  optInExperimental: z.boolean(),
  language: z.string(),
  maxChatIterations: z.number(),
  chatFontSize: z.enum(['xs', 'sm', 'base', 'lg']),
});

type FormSchemaType = z.infer<typeof formSchema>;

const SettingsSection = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => {
  return (
    <div className="space-y-4">
      <h2 className="text-text-default text-base font-semibold">{title}</h2>
      <Card className="bg-bg-secondary border-divider w-full rounded-lg p-0">
        {children}
      </Card>
    </div>
  );
};

const SettingsPage = () => {
  const { t } = useTranslation();
  const auth = useAuth((authStore) => authStore.auth);
  const gpu = useGpuConnect();

  const userLanguage = useSettings((state) => state.userLanguage);
  const setUserLanguage = useSettings((state) => state.setUserLanguage);
  const optInAnalytics = useSettings((state) =>
    state.getStepChoice(OnboardingStep.ANALYTICS),
  );
  const optInExperimental = useSettings((state) => state.optInExperimental);
  const setOptInExperimental = useSettings(
    (state) => state.setOptInExperimental,
  );
  const smartRouting = useSettings((state) => state.smartRouting);
  const setSmartRouting = useSettings((state) => state.setSmartRouting);
  const setEmbeddingModelMismatchPromptDismissed = useSettings(
    (state) => state.setEmbeddingModelMismatchPromptDismissed,
  );

  const defaultAgentId = useSettings(
    (settingsStore) => settingsStore.defaultAgentId,
  );
  const setDefaultAgentId = useSettings(
    (settingsStore) => settingsStore.setDefaultAgentId,
  );

  const { nodeInfo } = useGetHealth({
    nodeAddress: auth?.node_address ?? '',
  });

  const { mutateAsync: setMaxChatIterationsMutation } = useSetMaxChatIterations(
    {
      onSuccess: (_data) => {
        toast.success(t('settings.maxChatIterations.success'));
      },
      onError: (error) => {
        toast.error(t('settings.maxChatIterations.error'), {
          description: error?.message,
        });
        form.setValue('maxChatIterations', preferences?.max_iterations ?? 10);
      },
    },
  );
  const { data: preferences } = useGetPreferences({
    nodeAddress: auth?.node_address ?? '',
    token: auth?.api_v2_key ?? '',
  });
  const [appVersion, setAppVersion] = useState('');

  const form = useForm<FormSchemaType>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      defaultAgentId: defaultAgentId,
      nodeAddress: auth?.node_address,
      optInAnalytics: !!optInAnalytics,
      optInExperimental,
      language: userLanguage,
    },
  });

  const currentDefaultAgentId = useWatch({
    control: form.control,
    name: 'defaultAgentId',
  });

  const currentOptInExperimental = useWatch({
    control: form.control,
    name: 'optInExperimental',
  });
  const currentLanguage = useWatch({
    control: form.control,
    name: 'language',
  });

  const currentMaxChatIterations = useWatch({
    control: form.control,
    name: 'maxChatIterations',
  });

  const debouncedMaxChatIterations = useDebounce(
    currentMaxChatIterations?.toString() ?? '',
    1000,
  );

  useEffect(() => {
    void (async () => {
      setAppVersion(await getVersion());
    })();
  }, []);

  useEffect(() => {
    setUserLanguage(currentLanguage as LocaleMode);
  }, [currentLanguage, setUserLanguage]);

  useEffect(() => {
    setOptInExperimental(currentOptInExperimental);
  }, [currentOptInExperimental, setOptInExperimental]);

  useEffect(() => {
    if (preferences) {
      form.setValue('maxChatIterations', preferences.max_iterations ?? 10);
    }
  }, [preferences, form]);

  useEffect(() => {
    if (!preferences) return;
    const currentFormValue = form.getValues('maxChatIterations');
    const currentBackendValue = preferences.max_iterations ?? 10;
    if (currentFormValue === currentBackendValue) return; // Avoid unnecessary update at startup
    const newMaxIterations = parseInt(debouncedMaxChatIterations, 10);
    if (!debouncedMaxChatIterations || isNaN(newMaxIterations)) return;

    if (newMaxIterations !== currentBackendValue) {
      void setMaxChatIterationsMutation({
        nodeAddress: auth?.node_address ?? '',
        token: auth?.api_v2_key ?? '',
        maxIterations: newMaxIterations,
      });
    }
  }, [
    debouncedMaxChatIterations,
    preferences,
    auth,
    setMaxChatIterationsMutation,
    form,
  ]);

  const { llmProviders } = useGetLLMProviders({
    nodeAddress: auth?.node_address ?? '',
    token: auth?.api_v2_key ?? '',
  });

  const { data: updateState } = useUpdateStateQuery();
  const { refetch: checkForUpdates, isFetching: isCheckingUpdates } =
    useCheckUpdateQuery({
      enabled: false,
    });
  const { mutateAsync: downloadUpdate, isPending: isDownloadingUpdate } =
    useDownloadUpdateMutation({
      onSuccess: () => {
        toast.success(
          'Update downloaded successfully! The app will restart now.',
        );
      },
      onError: (error) => {
        toast.error('Failed to download update', {
          description: error?.message,
        });
      },
    });

  const { data: hanzoFreeModelQuota, isPending: isHanzoFreeModelQuotaPending } =
    useGetHanzoFreeModelQuota(
      { nodeAddress: auth?.node_address ?? '', token: auth?.api_v2_key ?? '' },
      { enabled: !!auth },
    );

  useEffect(() => {
    setDefaultAgentId(currentDefaultAgentId);
  }, [currentDefaultAgentId, setDefaultAgentId]);

  const isIdentityLocalhost = isHanzoIdentityLocalhost(
    auth?.hanzo_identity ?? '',
  );

  return (
    <SimpleLayout classname="max-w-4xl" title={t('settings.layout.general')}>
      <FeedbackModal buttonProps={{ className: 'absolute right-6 top-6' }} />
      <div className="flex flex-col space-y-8 pr-2.5 pb-20">
        <div className="flex flex-col space-y-8">
          {isHanzoFreeModelQuotaPending ? (
            <Skeleton className="h-[140px] w-full" />
          ) : (
            hanzoFreeModelQuota && (
              <SettingsSection title="Usage">
                <CardContent className="space-y-2 px-4 py-3">
                  <div className="flex justify-between text-sm">
                    <h3 className="text-base font-semibold">
                      Free {getBrand().name} Usage
                    </h3>

                    <div className="flex items-center gap-1">
                      <span>Total tokens used: </span>
                      <span className="text-text-default text-xs">
                        {hanzoFreeModelQuota.usedTokens.toLocaleString()}{' '}
                        <span className="text-text-tertiary text-xs">
                          / {hanzoFreeModelQuota.tokensQuota.toLocaleString()}
                        </span>
                      </span>
                      <Tooltip placement="top">
                        <TooltipTrigger>
                          <InfoIcon className="size-3 text-current" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>
                            A token is a chunk of text — it can be a word, part
                            of a word, or even punctuation. AI processes text in
                            tokens, and usage is measured by how many tokens are
                            used. <br /> <br /> Based on your current usage, you
                            have approximately{' '}
                            {Math.floor(
                              (hanzoFreeModelQuota.tokensQuota -
                                hanzoFreeModelQuota.usedTokens) /
                                2,
                            )}{' '}
                            messages remaining.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                  <Progress
                    height={8}
                    minW={0}
                    rounded="$10"
                    max={100}
                    value={
                      hanzoFreeModelQuota?.tokensQuota
                        ? Math.min(
                            100,
                            (hanzoFreeModelQuota.usedTokens /
                              hanzoFreeModelQuota.tokensQuota) *
                              100,
                          )
                        : 0
                    }
                  />
                  <div className="p-0">
                    <span className="text-text-default text-xs">
                      Your free limit resets in{' '}
                      {formatDuration(
                        intervalToDuration({
                          start: 0,
                          end: hanzoFreeModelQuota?.resetTime * 60 * 1000,
                        }),
                      )}
                    </span>
                  </div>
                </CardContent>
              </SettingsSection>
            )
          )}
          <SettingsSection title="Preferences">
            <Form {...form}>
              <form className="divide-divider flex grow flex-col justify-between divide-y overflow-hidden">
                <div className="flex justify-between gap-1 px-4 py-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-text-default text-sm">
                      {t('settings.language.label')}
                    </span>
                    <span className="text-text-secondary text-xs">
                      Select the default language used in the app.
                    </span>
                  </div>

                  <FormField
                    control={form.control}
                    name="language"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="sr-only">
                          {t('settings.language.label')}
                        </FormLabel>
                        <Select
                          defaultValue={field.value}
                          onValueChange={field.onChange}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue
                                placeholder={t(
                                  'settings.language.selectLanguage',
                                )}
                              />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {[
                              {
                                label: 'Automatic',
                                value: 'auto',
                              },
                              ...localeOptions,
                            ].map((locale) => (
                              <SelectItem
                                key={locale.value}
                                value={locale.value}
                              >
                                {locale.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />
                </div>
                <div className="flex justify-between gap-1 px-4 py-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-text-default text-sm">
                      {t('settings.defaultAgent')}
                    </span>
                    <span className="text-text-secondary text-xs">
                      Choose the AI model that will be used by default.
                    </span>
                  </div>
                  <FormItem>
                    <Select
                      defaultValue={defaultAgentId}
                      name="defaultAgentId"
                      onValueChange={(value) => {
                        form.setValue('defaultAgentId', value);
                      }}
                      value={
                        llmProviders?.find(
                          (agent) => agent.id === defaultAgentId,
                        )?.id
                      }
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <FormLabel className="sr-only">
                        {t('settings.defaultAgent')}
                      </FormLabel>
                      <SelectContent>
                        {llmProviders?.map((llmProvider) => (
                          <SelectItem
                            key={llmProvider.id}
                            value={llmProvider.id}
                          >
                            {llmProvider.name || llmProvider.id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <FormMessage />
                  </FormItem>
                </div>
              </form>
            </Form>
          </SettingsSection>
          <SettingsSection title="Smart routing">
            <div className="divide-divider flex flex-col gap-1 divide-y text-sm">
              <div className="flex items-center justify-between gap-1 px-4 py-3">
                <div className="flex flex-col gap-1 pr-4">
                  <span className="text-text-default text-sm">
                    Smart routing
                  </span>
                  <span className="text-text-secondary text-xs">
                    Route each request to the best available model (local zen
                    models first, frontier only when needed). Billed as the
                    model that serves you. Applies to new chats on a Hanzo Cloud
                    connection (api.hanzo.ai); local-only setups are unaffected.{' '}
                    <a
                      className="text-cyan-400 underline"
                      href="https://docs.hanzo.ai/docs/usage/routing"
                      rel="noreferrer"
                      target="_blank"
                    >
                      Learn more
                    </a>
                  </span>
                </div>
                <Switch
                  checked={smartRouting}
                  onCheckedChange={setSmartRouting}
                  className="data-[state=unchecked]:bg-gray-400"
                />
              </div>
            </div>
          </SettingsSection>
          <SettingsSection title={`${getBrand().name} Node Configuration`}>
            <div className="divide-divider flex flex-col divide-y">
              {[
                {
                  label: t('hanzoNode.nodeAddress'),
                  description: `The URL of your ${getBrand().name} node connection`,
                  value: auth?.node_address,
                },
                {
                  label: t('hanzoNode.nodeVersion'),
                  description: `Current version of your ${getBrand().name} node.`,
                  value: nodeInfo?.version,
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between gap-1 px-4 py-3"
                >
                  <div className="flex flex-col gap-1">
                    <span className="text-text-default text-sm">
                      {item.label}
                    </span>
                    <span className="text-text-secondary text-xs">
                      {item.description}
                    </span>
                  </div>
                  <span className="text-text-default font-mono text-sm">
                    {item.value}
                  </span>
                </div>
              ))}

              <div className="border-border flex items-center justify-between border-b px-4 py-3">
                <div className="flex flex-1 flex-col gap-1">
                  <div className="flex flex-col gap-1">
                    <h3 className="text-text-default text-sm">
                      {getBrand().name} Identity
                    </h3>
                    <p className="text-text-secondary text-xs">
                      Connects your app to the {getBrand().name} Network with
                      peer-to-peer access.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <HanzoIdentityDialog />
                  {!isIdentityLocalhost && (
                    <Tooltip placement="top">
                      <TooltipTrigger>
                        <a
                          className={cn(
                            buttonVariants({
                              size: 'sm',
                              variant: 'outline',
                            }),
                          )}
                          href={`https://hanzo-contracts.pages.dev/identity/${auth?.hanzo_identity?.replace(
                            '@@',
                            '',
                          )}?encryption_pk=${auth?.encryption_pk}&signature_pk=${auth?.identity_pk}`}
                          rel="noreferrer"
                          target="_blank"
                        >
                          <span className="flex gap-1">
                            <ShieldCheckIcon className="h-4 w-4" />
                            <span className="capitalize">Verify</span>
                          </span>
                        </a>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>
                          {t(
                            'settings.hanzoIdentity.checkIdentityInSyncDescription',
                          )}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </div>
            </div>
          </SettingsSection>
          <SettingsSection title="Advanced Settings">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex flex-col gap-1">
                <h3 className="text-text-default text-sm">Embedding Model</h3>
                <p className="text-text-secondary text-xs">
                  Choose the model used to generate embeddings, which power
                  search, <br /> recommendations, and semantic understanding in
                  the app.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <EmbeddingModelSelectionDialog />
              </div>
            </div>

            <Form {...form}>
              <form className="divide-divider flex grow flex-col justify-between divide-y overflow-hidden">
                <div className="flex justify-between gap-1 px-4 py-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-text-default text-sm">
                      {t('settings.maxChatIterations.label')}
                    </span>
                    <span className="text-text-secondary text-xs">
                      {t('settings.maxChatIterations.description')}
                    </span>
                  </div>
                  <FormField
                    control={form.control}
                    name="maxChatIterations"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="sr-only">
                          {t('settings.maxChatIterations.label')}
                        </FormLabel>
                        <FormControl>
                          <TextField
                            field={{ ...field, value: field.value ?? '' }}
                            label={null}
                            classes={{
                              input: '!h-9 py-2 w-auto border-gray-500',
                            }}
                            max={100}
                            min={1}
                            type="number"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="flex items-center justify-between gap-1 px-4 py-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-text-default text-sm">
                      {t('settings.experimentalFeature.label')}
                    </span>
                    <span className="text-text-secondary text-xs">
                      Access early previews of features to test and give
                      feedback. <br /> These may be unstable and can change or
                      be removed.
                    </span>
                  </div>
                  <FormField
                    control={form.control}
                    name="optInExperimental"
                    render={({ field }) => (
                      <FormItem className="flex gap-2.5">
                        <FormControl>
                          <Switch
                            aria-readonly
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            className="data-[state=unchecked]:bg-gray-400"
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="sr-only">
                            {t('settings.experimentalFeature.label')}
                          </FormLabel>
                        </div>
                      </FormItem>
                    )}
                  />
                </div>
              </form>
            </Form>
          </SettingsSection>
          <SettingsSection title="Cloud GPU">
            <div className="divide-divider flex flex-col gap-1 divide-y text-sm">
              <div className="flex items-center justify-between gap-1 px-4 py-3">
                <div className="flex flex-col gap-1 pr-4">
                  <span className="text-text-default text-sm">
                    Connect this device&apos;s GPU to Hanzo Cloud
                  </span>
                  <span className="text-text-secondary text-xs">
                    {gpu.connected
                      ? 'Connected — this machine appears in the Hanzo console (Machines & GPUs) and can run cloud jobs.'
                      : gpu.signedIn
                        ? 'Share this device’s GPU with your Hanzo org to run cloud jobs.'
                        : 'Sign in to your Hanzo account to connect this device’s GPU.'}
                    {gpu.error ? ` ${gpu.error}` : ''}
                  </span>
                </div>
                <Switch
                  checked={gpu.connected}
                  disabled={!gpu.signedIn}
                  onCheckedChange={(checked: any) => void gpu.toggle(checked)}
                  className="data-[state=unchecked]:bg-gray-400"
                />
              </div>
            </div>
          </SettingsSection>
          <SettingsSection title="Updates">
            <div className="divide-divider flex flex-col gap-1 divide-y text-sm">
              <div className="flex items-center justify-between gap-1 px-4 py-3">
                <span className="text-text-default text-sm">
                  Current {getBrand().name} App Version
                </span>
                <div className="flex items-center gap-6">
                  <span className="text-text-default font-mono text-sm">
                    v.{appVersion}
                  </span>
                  <Button
                    disabled={isCheckingUpdates}
                    onClick={() => checkForUpdates()}
                    size="sm"
                    variant="outline"
                    className="w-full sm:w-auto"
                  >
                    {isCheckingUpdates ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        Checking...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Check for Updates
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <div className="space-y-5 px-4 py-3">
                {updateState?.update?.available && (
                  <div className="flex items-center justify-between gap-2">
                    {updateState?.update?.available && (
                      <Badge className="flex items-center gap-1 rounded-full bg-gray-900 px-2 py-0.5 text-sm font-semibold text-cyan-400">
                        <CheckCircle className="h-3.5 w-3.5" />
                        New version available: {updateState.update.version}
                      </Badge>
                    )}
                    <Button
                      disabled={
                        isDownloadingUpdate ||
                        updateState.state === 'downloading'
                      }
                      onClick={() => downloadUpdate()}
                      size="sm"
                      variant="outline"
                      className="w-full sm:w-auto"
                    >
                      {isDownloadingUpdate ||
                      updateState.state === 'downloading' ? (
                        <>Downloading...</>
                      ) : (
                        <>Install Update</>
                      )}
                    </Button>
                  </div>
                )}

                {updateState?.state === 'downloading' &&
                  updateState.downloadState && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1">
                          Downloading update...
                        </span>
                        <span>
                          {updateState.downloadState.data
                            ?.downloadProgressPercent || 0}
                          %
                        </span>
                      </div>
                      <Progress
                        height={8}
                        minW={0}
                        rounded="$3"
                        width="100%"
                        value={
                          updateState.downloadState.data
                            ?.downloadProgressPercent || 0
                        }
                      />
                    </div>
                  )}
              </div>
            </div>
          </SettingsSection>
        </div>
      </div>
    </SimpleLayout>
  );
};

export default SettingsPage;
