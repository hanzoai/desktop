import { DialogClose } from '@radix-ui/react-dialog';
import { useTranslation } from '@hanzo_network/hanzo-i18n';
import { useRemoveToolOffering } from '@hanzo_network/hanzo-node-state/v2/mutations/removeToolOffering/useRemoveToolOffering';
import {
  Button,
  buttonVariants,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@hanzo_network/hanzo-ui';
import { cn } from '@hanzo_network/hanzo-ui/utils';

import { EyeOffIcon } from 'lucide-react';
import { useState } from 'react';

import { toast } from 'sonner';

import { useAuth } from '../../store/auth';

export default function RemoveToolOfferingButton({
  toolKey,
}: {
  toolKey: string;
}) {
  const { t } = useTranslation();
  const auth = useAuth((state) => state.auth);
  const [isOpen, setIsOpen] = useState(false);

  const {
    mutateAsync: removeToolOffering,
    isPending: isRemoveToolOfferingPending,
  } = useRemoveToolOffering({
    onSuccess: async () => {
      toast.success('Tool has been unpublished successfully.');
      setIsOpen(false);
    },
    onError: (error) => {
      toast.error('Failed to unpublish tool', {
        description: error.response?.data?.message ?? error.message,
      });
    },
  });

  const handleRemove = async () => {
    await removeToolOffering({
      toolKey: toolKey ?? '',
      nodeAddress: auth?.node_address ?? '',
      token: auth?.api_v2_key ?? '',
    });
  };

  return (
    <Dialog onOpenChange={setIsOpen} open={isOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <button
              className={cn(
                buttonVariants({
                  variant: 'outline',
                  size: 'md',
                }),
              )}
            >
              <EyeOffIcon className="h-4 w-4" />
              {t('common.unpublish')}
            </button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent align="center" side="top">
          {t('networkAgentsPage.removeToolOffering')}
        </TooltipContent>
      </Tooltip>
      <DialogContent className="sm:max-w-[425px]">
        <DialogTitle className="pb-0">
          {t('networkAgentsPage.removeToolOffering')}
        </DialogTitle>
        <DialogDescription>
          {t('networkAgentsPage.removeToolOfferingConfirmation')}
        </DialogDescription>

        <DialogFooter>
          <div className="flex gap-2 pt-4">
            <DialogClose asChild className="flex-1">
              <Button
                className="min-w-[100px] flex-1"
                size="sm"
                type="button"
                variant="outline"
              >
                {t('common.cancel')}
              </Button>
            </DialogClose>
            <Button
              className="min-w-[100px] flex-1"
              isLoading={isRemoveToolOfferingPending}
              onClick={handleRemove}
              size="sm"
              variant="destructive"
            >
              {t('common.unpublish')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
