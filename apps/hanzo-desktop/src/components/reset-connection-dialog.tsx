import { useTranslation } from '@hanzo/desktop-i18n';
import { useInitialRegistration } from '@hanzo/desktop-node-state/v2/mutations/initialRegistration/useInitialRegistration';
import { useGetEncryptionKeys } from '@hanzo/desktop-node-state/v2/queries/getEncryptionKeys/useGetEncryptionKeys';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
} from '@hanzo/desktop-ui';
import { submitRegistrationNoCodeError } from '@hanzo/desktop-ui/helpers';
import { XIcon } from 'lucide-react';
import { useNavigate } from 'react-router';

import {
  useHanzoNodeKillMutation,
  useHanzoNodeRemoveStorageMutation,
  useHanzoNodeSpawnMutation,
} from '../lib/hanzo-node-manager/hanzo-node-manager-client';
import { useAuth } from '../store/auth';
import { useHanzoNodeManager } from '../store/hanzo-node-manager';

export const ResetConnectionDialog = ({
  isOpen,
  onOpenChange,
  allowClose = false,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  allowClose?: boolean;
}) => {
  const { t } = useTranslation();
  const { mutateAsync: hanzoNodeKill, isPending: isHanzoNodeKillPending } =
    useHanzoNodeKillMutation();
  const { mutateAsync: hanzoNodeSpawn, isPending: isHanzoNodeSpawnPending } =
    useHanzoNodeSpawnMutation({
      onSuccess: async () => {
        if (!encryptionKeys) return;
        await submitRegistrationNoCode({
          nodeAddress: 'http://127.0.0.1:3690',
          profileEncryptionPk: encryptionKeys.profile_encryption_pk,
          profileIdentityPk: encryptionKeys.profile_identity_pk,
        });
      },
    });
  const {
    mutateAsync: hanzoNodeRemoveStorage,
    isPending: isHanzoNodeRemoveStoragePending,
  } = useHanzoNodeRemoveStorageMutation();
  const { setHanzoNodeOptions } = useHanzoNodeManager();
  const { encryptionKeys } = useGetEncryptionKeys();
  const setAuth = useAuth((state) => state.setAuth);
  const navigate = useNavigate();

  const isResetLoading =
    isHanzoNodeKillPending ||
    isHanzoNodeRemoveStoragePending ||
    isHanzoNodeSpawnPending;

  const { mutateAsync: submitRegistrationNoCode } = useInitialRegistration({
    onSuccess: (response, setupPayload) => {
      if (response.status !== 'success') {
        void hanzoNodeKill();
      }
      if (response.status === 'success' && encryptionKeys) {
        setAuth({
          api_v2_key: response.data?.api_v2_key ?? '',
          node_address: setupPayload.nodeAddress,
          profile: 'main',
          hanzo_identity: response.data?.node_name ?? '',
          encryption_pk: response.data?.encryption_public_key ?? '',
          identity_pk: response.data?.identity_public_key ?? '',
        });

        void navigate('/ai-model-installation');
        onOpenChange(false);
      } else {
        submitRegistrationNoCodeError();
      }
    },
  });

  const handleReset = async () => {
    await hanzoNodeKill();
    useAuth.getState().setLogout(); // clean up local storage
    await hanzoNodeRemoveStorage({ preserveKeys: true });
    setHanzoNodeOptions(null);
    await hanzoNodeSpawn();
  };

  return (
    <AlertDialog onOpenChange={onOpenChange} open={isOpen}>
      <AlertDialogContent width="75%">
        {allowClose && (
          <AlertDialogCancel
            borderWidth={0}
            className="absolute top-3 right-3"
            disabled={isResetLoading}
          >
            <XIcon className="h-4 w-4" />
          </AlertDialogCancel>
        )}
        <AlertDialogHeader>
          <AlertDialogTitle>{t('appReset.title')}</AlertDialogTitle>
          <AlertDialogDescription>
            <div className="flex flex-col space-y-3 text-left text-white/70">
              <div className="text-sm">{t('appReset.description')}</div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="mt-4" gap={10}>
          <Button
            className="min-w-32 text-sm"
            disabled={isResetLoading}
            isLoading={isResetLoading}
            onClick={handleReset}
            size="sm"
            variant={'destructive'}
          >
            {t('appReset.action')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
