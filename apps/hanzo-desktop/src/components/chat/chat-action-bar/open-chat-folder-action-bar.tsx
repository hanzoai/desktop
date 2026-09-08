import { useTranslation } from '@hanzo/desktop-i18n';
import { Tooltip, TooltipContent, TooltipTrigger } from '@hanzo/desktop-ui';
import { cn } from '@hanzo/desktop-ui/utils';
import { Folder } from 'lucide-react';

import { actionButtonClassnames } from '../conversation-footer';

type OpenChatFolderActionBarProps = {
  onClick: () => void;
  disabled?: boolean;
  showLabel?: boolean;
};

function OpenChatFolderActionBarBase({
  onClick,
  disabled,
  showLabel,
}: OpenChatFolderActionBarProps) {
  const { t } = useTranslation();
  if (showLabel) {
    return (
      <button
        className={cn(actionButtonClassnames, 'w-full justify-start gap-2.5')}
        disabled={disabled}
        onClick={onClick}
        type="button"
      >
        <Folder className="size-4" />
        <span className="">{t('chat.openChatFolder')}</span>
      </button>
    );
  }

  return (
    <>
      <Tooltip placement="top">
        <TooltipTrigger asChild>
          <button
            className={cn(actionButtonClassnames, 'p-2', {
              'opacity-50': disabled,
            })}
            disabled={disabled}
            onClick={onClick}
            type="button"
          >
            <Folder className="h-full w-full" />
          </button>
        </TooltipTrigger>
        <TooltipContent>{t('chat.openChatFolder')}</TooltipContent>
      </Tooltip>
    </>
  );
}
export const OpenChatFolderActionBar = OpenChatFolderActionBarBase;
