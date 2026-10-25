import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from '@hanzo/desktop-i18n';
import {
  type QuickConnectFormSchema,
  quickConnectFormSchema,
} from '@hanzo/desktop-node-state/forms/auth/quick-connection';
import { useInitialRegistration } from '@hanzo/desktop-node-state/v2/mutations/initialRegistration/useInitialRegistration';
import { useGetEncryptionKeys } from '@hanzo/desktop-node-state/v2/queries/getEncryptionKeys/useGetEncryptionKeys';
import { Button, buttonVariants, Checkbox } from '@hanzo/desktop-ui';
import { submitRegistrationNoCodeError } from '@hanzo/desktop-ui/helpers';
import { cn } from '@hanzo/desktop-ui/utils';
import { createContext, useContext, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { toast } from 'sonner';

import { OnboardingStep } from '../components/onboarding/constants';
import { ResetStorageBeforeConnectConfirmationPrompt } from '../components/reset-storage-before-connect-confirmation-prompt';
import config from '../config';
import { useIamLogin } from '../hooks/iam-auth';
import {
  useHanzoNodeRemoveStorageMutation,
  useHanzoNodeSpawnMutation,
  useHanzoNodeKillMutation,
} from '../lib/hanzo-node-manager/hanzo-node-manager-client';
import { useAuth } from '../store/auth';
import { useSettings } from '../store/settings';
import { useHanzoNodeManager } from '../store/hanzo-node-manager';

export const LogoTapContext = createContext<{
  tapCount: number;
  setTapCount: (count: number) => void;
  showLocalNodeOption: boolean;
  setShowLocalNodeOption: (show: boolean) => void;
}>({
  tapCount: 0,
  setTapCount: () => {
    // no-op
  },
  showLocalNodeOption: false,
  setShowLocalNodeOption: () => {
    // no-op
  },
});

export const useLogoTap = () => useContext(LogoTapContext);

export const LogoTapProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [tapCount, setTapCount] = useState(0);
  const [showLocalNodeOption, setShowLocalNodeOption] = useState(false);

  return (
    <LogoTapContext.Provider
      value={{
        tapCount,
        setTapCount,
        showLocalNodeOption,
        setShowLocalNodeOption,
      }}
    >
      {children}
    </LogoTapContext.Provider>
  );
};

const TermsAndConditionsPage = () => {
  const { t, Trans } = useTranslation();
  const [termsAndConditionsAccepted, setTermsAndConditionsAccepted] =
    useState(false);
  const { showLocalNodeOption } = useLogoTap();

  const completeStep = useSettings((state) => state.completeStep);

  const termsAndConditionsAcceptedLegacy = useSettings((state) =>
    state.getTermsAndConditionsAccepted(),
  );
  const isLocalHanzoNodeInUse = useHanzoNodeManager((state) => state.isInUse);
  useEffect(() => {
    if (
      termsAndConditionsAcceptedLegacy !== undefined &&
      isLocalHanzoNodeInUse
    ) {
      completeStep(OnboardingStep.TERMS_CONDITIONS, true);
    }
  }, [completeStep, isLocalHanzoNodeInUse, termsAndConditionsAcceptedLegacy]);

  const setAuth = useAuth((state) => state.setAuth);
  const [
    resetStorageBeforeConnectConfirmationPromptOpen,
    setResetStorageBeforeConnectConfirmationPrompt,
  ] = useState(false);

  const { encryptionKeys } = useGetEncryptionKeys();
  const setupDataForm = useForm<QuickConnectFormSchema>({
    resolver: zodResolver(quickConnectFormSchema),
    defaultValues: {
      node_address: 'http://127.0.0.1:3690',
    },
  });

  // IAM login hook is read BEFORE useInitialRegistration so its values are in
  // scope for the registration onSuccess closure below. `hanzoTokensRef` is the
  // closure-safe mirror of the reactive tokens: the mutation's onSuccess is a
  // long-lived closure, so reading the ref (not the render-captured `tokens`)
  // guarantees a token obtained mid-flow is actually persisted.
  const {
    login: hanzoLogin,
    tokensRef: hanzoTokensRef,
    isLoading: hanzoLoginIsLoading,
    error: hanzoLoginError,
    resetState: resetHanzoLogin,
  } = useIamLogin();

  const {
    mutateAsync: submitRegistrationNoCode,
    isPending: submitRegistrationNodeCodeIsPending,
  } = useInitialRegistration({
    onSuccess: (response, setupPayload) => {
      if (response.status === 'success' && encryptionKeys) {
        const hanzoTokens = hanzoTokensRef.current;
        setAuth({
          api_v2_key: response.data?.api_v2_key ?? '',
          node_address: setupPayload.nodeAddress,
          profile: 'main',
          hanzo_identity: response.data?.node_name ?? '',
          encryption_pk: response.data?.encryption_public_key ?? '',
          identity_pk: response.data?.identity_public_key ?? '',
          ...(hanzoTokens
            ? {
                hanzo_token: hanzoTokens.access_token,
                hanzo_refresh_token: hanzoTokens.refresh_token,
              }
            : {}),
        });
        completeStep(OnboardingStep.TERMS_CONDITIONS, true);
      } else if (response.status === 'non-pristine') {
        setResetStorageBeforeConnectConfirmationPrompt(true);
      } else {
        submitRegistrationNoCodeError();
      }
    },
  });
  const { isPending: hanzoNodeRemoveStorageIsPending } =
    useHanzoNodeRemoveStorageMutation();
  const { isPending: hanzoNodeSpawnIsPending, mutateAsync: hanzoNodeSpawn } =
    useHanzoNodeSpawnMutation({
      onSuccess: () => {
        void onSubmit(setupDataForm.getValues());
      },
      onError: (error) => {
        // Previously a failed local-node spawn was swallowed silently, so the
        // "Get Started Free" button appeared to do nothing. Surface the reason.
        toast.error('Failed to start the local Hanzo node', {
          description: error instanceof Error ? error.message : String(error),
          position: 'bottom-center',
        });
      },
    });
  const { isPending: hanzoNodeKillIsPending } = useHanzoNodeKillMutation();

  const isStartLocalButtonLoading =
    hanzoNodeSpawnIsPending ||
    hanzoNodeKillIsPending ||
    hanzoNodeRemoveStorageIsPending ||
    submitRegistrationNodeCodeIsPending;

  const handleHanzoLogin = async () => {
    try {
      // `login()` drives the hook's reactive isLoading/error/tokens state, so a
      // failure surfaces in the inline error UI below with a retry.
      const tokens = await hanzoLogin();
      setAuth({
        api_v2_key: '',
        node_address: '',
        profile: 'main',
        hanzo_identity: '',
        encryption_pk: '',
        identity_pk: '',
        hanzo_token: tokens.access_token,
        hanzo_refresh_token: tokens.refresh_token,
      });
      // Cloud login — skip local node, complete onboarding directly.
      completeStep(OnboardingStep.TERMS_CONDITIONS, true);
    } catch (err) {
      // Error is already captured in `hanzoLoginError`; log for diagnostics.
      console.error('Hanzo login failed:', err);
    }
  };

  const retryHanzoLogin = () => {
    resetHanzoLogin();
    void handleHanzoLogin();
  };

  async function onSubmit(currentValues: QuickConnectFormSchema) {
    if (!encryptionKeys) {
      // Don't silently no-op: tell the user why nothing advanced.
      toast.error(
        'Encryption keys are not ready yet — please try again in a moment',
        {
          position: 'bottom-center',
        },
      );
      return;
    }
    await submitRegistrationNoCode({
      nodeAddress: currentValues.node_address,
      profileEncryptionPk: encryptionKeys.profile_encryption_pk,
      profileIdentityPk: encryptionKeys.profile_identity_pk,
    });
  }

  const onCancelConfirmation = () => {
    setResetStorageBeforeConnectConfirmationPrompt(false);
  };

  const onRestoreConfirmation = () => {
    setResetStorageBeforeConnectConfirmationPrompt(false);
  };

  const onResetConfirmation = () => {
    setResetStorageBeforeConnectConfirmationPrompt(false);
    void onSubmit(setupDataForm.getValues());
  };

  return (
    <div className="flex h-full flex-col justify-between gap-10">
      <div className="space-y-5">
        <h1 className="font-sans text-4xl font-semibold text-white">
          {t('desktop.welcome')}
        </h1>
        <p className="text-base text-white">
          <Trans
            components={{
              b: <span className={'font-semibold text-white'} />,
            }}
            i18nKey="desktop.welcomeDescription"
          />
        </p>
      </div>
      <div className="flex gap-3">
        <Checkbox
          checked={termsAndConditionsAccepted}
          id="terms"
          onCheckedChange={(checked: any) =>
            setTermsAndConditionsAccepted(checked as boolean)
          }
        />
        <label
          className="inline-block cursor-pointer text-sm leading-none text-white peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          htmlFor="terms"
        >
          <span className={'leading-4 tracking-wide'}>
            <Trans
              components={{
                a: (
                  <a
                    className={'text-white underline'}
                    href={'https://hanzo.ai/terms-of-service'}
                    rel="noreferrer"
                    target={'_blank'}
                  />
                ),
                b: (
                  <a
                    className={'text-white underline'}
                    href={'https://hanzo.ai/privacy-policy'}
                    rel="noreferrer"
                    target={'_blank'}
                  />
                ),
              }}
              i18nKey="common.termsAndConditionsText"
            />
          </span>
        </label>
      </div>

      <div className="flex flex-1 flex-col justify-end gap-4">
        {hanzoLoginError && (
          <div
            className="flex items-center justify-between gap-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200"
            role="alert"
          >
            <span>{hanzoLoginError.message}</span>
            <button
              className="shrink-0 font-semibold underline"
              disabled={hanzoLoginIsLoading}
              onClick={() => retryHanzoLogin()}
              type="button"
            >
              {t('common.retry')}
            </button>
          </div>
        )}
        <Button
          className={cn(
            buttonVariants({
              variant: 'default',
              size: 'lg',
            }),
          )}
          disabled={!termsAndConditionsAccepted || hanzoLoginIsLoading}
          isLoading={hanzoLoginIsLoading}
          onClick={() => void handleHanzoLogin()}
        >
          {t('common.login')}
        </Button>
        <Button
          className={cn(
            buttonVariants({
              variant: 'outline',
              size: 'lg',
            }),
          )}
          disabled={!termsAndConditionsAccepted || isStartLocalButtonLoading}
          isLoading={isStartLocalButtonLoading}
          onClick={() => hanzoNodeSpawn()}
        >
          {t('common.skip')}
        </Button>

        {(config.isDev || showLocalNodeOption) && (
          <div className="items-center space-x-2 text-center text-sm text-white">
            <span>{t('common.alreadyHaveNode')}</span>
            <Link
              className="font-semibold text-white underline"
              to="/quick-connection"
            >
              {t('common.quickConnect')}
            </Link>
          </div>
        )}
      </div>
      <ResetStorageBeforeConnectConfirmationPrompt
        onCancel={() => onCancelConfirmation()}
        onReset={() => onResetConfirmation()}
        onRestore={() => onRestoreConfirmation()}
        open={resetStorageBeforeConnectConfirmationPromptOpen}
      />
    </div>
  );
};

export default TermsAndConditionsPage;
