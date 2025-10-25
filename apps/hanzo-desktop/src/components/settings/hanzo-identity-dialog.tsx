import { useTranslation } from '@hanzo_network/hanzo-i18n';
import { isHanzoIdentityLocalhost } from '@hanzo_network/hanzo-message-ts/utils';
import { useUpdateNodeName } from '@hanzo_network/hanzo-node-state/v2/mutations/updateNodeName/useUpdateNodeName';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Button,
  Input,
  Label,
  DialogFooter,
  DialogTrigger,
  buttonVariants,
} from '@hanzo_network/hanzo-ui';
import { cn } from '@hanzo_network/hanzo-ui/utils';
import { Edit3Icon, ExternalLinkIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useHanzoNodeRespawnMutation } from '../../lib/hanzo-node-manager/hanzo-node-manager-client';
import { isHostingHanzoNode } from '../../lib/hanzo-node-manager/hanzo-node-manager-windows-utils';
import { type Auth, useAuth } from '../../store/auth';
import { useHanzoNodeManager } from '../../store/hanzo-node-manager';

const HanzoIdentityDialog = () => {
  const [isOpen, setIsOpen] = useState(false);

  const [newIdentity, setNewIdentity] = useState('');
  const { t } = useTranslation();
  const auth = useAuth((authStore) => authStore.auth);
  const setAuth = useAuth((authStore) => authStore.setAuth);
  const isLocalHanzoNodeInUse = useHanzoNodeManager(
    (state) => state.isInUse,
  );
  const { mutateAsync: respawnHanzoNode } = useHanzoNodeRespawnMutation();

  const { mutateAsync: updateNodeName, isPending: isUpdateNodeNamePending } =
    useUpdateNodeName({
      onSuccess: async () => {
        toast.success(t('settings.hanzoIdentity.success'));
        if (!auth) return;
        const newAuth: Auth = { ...auth };
        setAuth({
          ...newAuth,
          hanzo_identity: newIdentity,
        });
        if (isLocalHanzoNodeInUse) {
          await respawnHanzoNode();
        } else if (!isHostingHanzoNode(auth.node_address)) {
          toast.info(t('hanzoNode.restartNode'));
        }
      },
      onError: (error) => {
        toast.error(t('settings.hanzoIdentity.error'), {
          description: error?.response?.data?.error
            ? error?.response?.data?.error +
              ': ' +
              error?.response?.data?.message
            : error.message,
        });
      },
    });

  const handleCancel = () => {
    setNewIdentity('');
    setIsOpen(false);
  };

  const handleUpdateNodeName = async () => {
    if (!auth) return;
    await updateNodeName({
      nodeAddress: auth?.node_address ?? '',
      token: auth?.api_v2_key ?? '',
      newNodeName: newIdentity,
    });
  };

  const isIdentityLocalhost = isHanzoIdentityLocalhost(
    auth?.hanzo_identity ?? '',
  );

  useEffect(() => {
    setNewIdentity(auth?.hanzo_identity ?? '');
  }, [auth?.hanzo_identity]);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsOpen(true)}
          disabled={isUpdateNodeNamePending}
          className="min-w-[100px] gap-2 rounded-md"
        >
          <span className="sr-only"> Update Hanzo Identity</span>
          <span className="text-text-default text-sm font-normal">
            {auth?.hanzo_identity}
          </span>
          <Edit3Icon className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl" showCloseButton>
        <DialogHeader>
          <DialogTitle className="font-semibold">
            Update Hanzo Identity
          </DialogTitle>
          <DialogDescription className="text-text-secondary text-sm">
            Connect your identity so you can take part in the Hanzo Network
            and use p2p capabilities
          </DialogDescription>
        </DialogHeader>

        <div className="mt-6 space-y-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-1">
              <Label htmlFor="identity">Enter the new Hanzo Identity</Label>
              <div className="text-text-secondary hover:text-text-default inline-flex items-center gap-1">
                {isIdentityLocalhost ? (
                  <a
                    className={cn(
                      buttonVariants({
                        size: 'auto',
                        variant: 'link',
                      }),
                      'rounded-lg p-0 text-xs text-inherit hover:underline',
                    )}
                    href={`https://hanzo-contracts.pages.dev?encryption_pk=${auth?.encryption_pk}&signature_pk=${auth?.identity_pk}&node_address=${auth?.node_address}`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {t('settings.hanzoIdentity.registerIdentity')}
                  </a>
                ) : (
                  <a
                    className={cn(
                      buttonVariants({
                        size: 'auto',
                        variant: 'link',
                      }),
                      'rounded-lg p-0 text-xs text-inherit hover:underline',
                    )}
                    href={`https://hanzo-contracts.pages.dev/identity/${auth?.hanzo_identity?.replace(
                      '@@',
                      '',
                    )}`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {t('settings.hanzoIdentity.goToHanzoIdentity')}
                  </a>
                )}
                <ExternalLinkIcon className="h-4 w-4" />
              </div>
            </div>
            <Input
              id="identity"
              value={newIdentity}
              onChange={(e) => setNewIdentity(e.target.value)}
              placeholder={`${auth?.hanzo_identity}`}
              disabled={isUpdateNodeNamePending}
              className="!h-10 py-2"
            />
          </div>
        </div>

        <DialogFooter className="mt-4 flex items-center !justify-between gap-1">
          <a
            className={cn(
              buttonVariants({
                size: 'auto',
                variant: 'link',
              }),
              'text-text-secondary hover:text-text-default block rounded-lg p-0 text-left text-xs hover:underline',
            )}
            href="https://docs.hanzo.ai/advanced/hanzo-identity"
            rel="noreferrer"
            target="_blank"
          >
            {t('settings.hanzoIdentity.troubleRegisterIdentity')}
          </a>
          <div className="flex items-center gap-1">
            <Button
              onClick={handleCancel}
              disabled={isUpdateNodeNamePending}
              variant="outline"
              className="w-auto min-w-[110px]"
              size="md"
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdateNodeName}
              disabled={
                !newIdentity.trim() ||
                newIdentity === auth?.hanzo_identity ||
                isUpdateNodeNamePending
              }
              className="w-auto min-w-[110px]"
              size="md"
            >
              {isUpdateNodeNamePending ? 'Updating...' : 'Update Identity'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default HanzoIdentityDialog;
