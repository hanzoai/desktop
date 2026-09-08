import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@hanzo/desktop-ui';
import { PromptLibraryIcon } from '@hanzo/desktop-ui/assets';
import { cn } from '@hanzo/desktop-ui/utils';
import { memo } from 'react';

import { usePromptSelectionStore } from '../../prompt/context/prompt-selection-context';
import { actionButtonClassnames } from '../conversation-footer';

function PromptSelectionActionBarBase({
  disabled,
  showLabel,
}: {
  disabled?: boolean;
  showLabel?: boolean;
}) {
  const setPromptSelectionDrawerOpen = usePromptSelectionStore(
    (state) => state.setPromptSelectionDrawerOpen,
  );

  if (!showLabel) {
    return (
      <TooltipProvider delay={0}>
        <Tooltip placement="top">
          <TooltipTrigger asChild>
            <button
              className={cn(actionButtonClassnames)}
              disabled={disabled}
              onClick={() => {
                setPromptSelectionDrawerOpen(true);
              }}
              type="button"
            >
              <PromptLibraryIcon className="h-full w-full" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Prompt Library</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  return (
    <button
      className={cn(actionButtonClassnames, 'w-full justify-start gap-2.5')}
      disabled={disabled}
      onClick={() => {
        setPromptSelectionDrawerOpen(true);
      }}
      type="button"
    >
      <PromptLibraryIcon className="size-4" />
      <span className="">Prompt Library</span>
    </button>
  );
}

const PromptSelectionActionBar = memo(
  PromptSelectionActionBarBase,
  (prevProps, nextProps) => {
    return prevProps.disabled === nextProps.disabled;
  },
);
export default PromptSelectionActionBar;
