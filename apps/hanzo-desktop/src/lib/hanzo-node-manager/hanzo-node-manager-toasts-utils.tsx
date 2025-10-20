import { t } from '@hanzo_network/hanzo-i18n';
import { cn } from '@hanzo_network/hanzo-ui/utils';
import React from 'react';
import { type ExternalToast, toast } from 'sonner';

import { openHanzoNodeManagerWindow } from './hanzo-node-manager-windows-utils';

export const modelNameMap: Record<string, string> = {
  'embeddinggemma:300m': "Embedding Gemma 300M",
  'llama3.1:8b-instruct-q4_1': 'Llama 3.1 8B',
  'gemma2:2b-instruct-q4_1': 'Gemma 2 2B',
  'command-r7b:7b-12-2024-q4_K_M': 'Command R 7B',
  'mistral-small3.2:24b-instruct-2506-q4_K_M': 'Mistral Small 3.2',
};

const HanzoNodeLogsLabel = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => {
  return (
    <span
      className={cn('cursor-pointer text-white', className)}
      onClick={async () => {
        await openHanzoNodeManagerWindow();
      }}
      {...props}
    >
      logs
    </span>
  );
};

export const HANZO_NODE_MANAGER_TOAST_ID = 'hanzo-node-manager-toast-id';
const defaultToastOptions: ExternalToast = {
  id: HANZO_NODE_MANAGER_TOAST_ID,
  position: 'top-right',
};

export const startingHanzoNodeToast = () => {
  return toast.loading(t('hanzoNode.notifications.startingNode'), {
    ...defaultToastOptions,
  });
};
export const hanzoNodeStartedToast = () => {
  return toast.success(t('hanzoNode.notifications.runningNode'), {
    ...defaultToastOptions,
  });
};
export const hanzoNodeStartErrorToast = () => {
  toast.error(
    <div>
      Error starting your local Hanzo Node, see <HanzoNodeLogsLabel /> for
      more information
    </div>,
    {
      ...defaultToastOptions,
    },
  );
};

export const startingOllamaToast = () => {
  return toast.loading(t('hanzoNode.notifications.startingOllama'), {
    ...defaultToastOptions,
  });
};
export const ollamaStartedToast = () => {
  return toast.success(t('hanzoNode.notifications.runningOllama'), {
    ...defaultToastOptions,
  });
};
export const ollamaStartErrorToast = () => {
  toast.error(
    <div>
      Error starting your local Ollama, see <HanzoNodeLogsLabel /> for more
      information
    </div>,
    {
      ...defaultToastOptions,
    },
  );
};

export const stoppingHanzoNodeToast = () => {
  return toast.loading(t('hanzoNode.notifications.stopNode'), {
    ...defaultToastOptions,
  });
};
export const hanzoNodeStopErrorToast = () => {
  toast.error(
    <div>
      Error stopping your local Hanzo Node, see <HanzoNodeLogsLabel /> for
      more information
    </div>,
    {
      ...defaultToastOptions,
    },
  );
};
export const hanzoNodeStoppedToast = () => {
  return toast.success(t('hanzoNode.notifications.stoppedNode'), {
    ...defaultToastOptions,
  });
};

export const stoppingOllamaToast = () => {
  return toast.loading(t('hanzoNode.notifications.stopOllama'), {
    ...defaultToastOptions,
  });
};
export const ollamaStopErrorToast = () => {
  toast.error(
    <div>
      Error stopping your local Ollama, see <HanzoNodeLogsLabel /> for more
      information
    </div>,
    {
      ...defaultToastOptions,
    },
  );
};
export const ollamaStoppedToast = () => {
  return toast.success(t('hanzoNode.notifications.stoppedOllama'), {
    ...defaultToastOptions,
  });
};

export const successRemovingHanzoNodeStorageToast = () => {
  return toast.success(t('hanzoNode.notifications.removedNote'), {
    ...defaultToastOptions,
  });
};

export const errorRemovingHanzoNodeStorageToast = () => {
  return toast.error(
    <div>
      Error removing your local Hanzo Node storage, see{' '}
      <HanzoNodeLogsLabel /> for more information
    </div>,
    { ...defaultToastOptions },
  );
};

export const successHanzoNodeSetDefaultOptionsToast = () => {
  return toast.success(t('hanzoNode.notifications.optionsRestored'), {
    ...defaultToastOptions,
  });
};

export const successOllamaModelsSyncToast = () => {
  return toast.success(t('hanzoNode.notifications.syncedOllama'), {
    ...defaultToastOptions,
  });
};

export const errorOllamaModelsSyncToast = () => {
  return toast.error(t('hanzoNode.notifications.errorSyncOllama'), {
    ...defaultToastOptions,
  });
};

export const pullingModelStartToast = (model: string) => {
  return toast.loading(
    t('hanzoNode.notifications.startingDownload', { modelName: model }),
    {
      ...defaultToastOptions,
    },
  );
};
export const pullingModelProgressToast = (model: string, progress: number) => {
  return toast.loading(
    t('hanzoNode.notifications.downloadingModel', {
      modelName: model,
      progress,
    }),
    {
      ...defaultToastOptions,
    },
  );
};
export const pullingModelDoneToast = (model: string) => {
  return toast.success(
    t('hanzoNode.notifications.downloadedModel', {
      modelName: modelNameMap[model],
    }),
    { duration: 3000 },
  );
};

export const pullingModelErrorToast = (model: string) => {
  return toast.error(
    <div>
      Error downloading AI model {model}, see <HanzoNodeLogsLabel /> for more
      information
    </div>,
    {
      ...defaultToastOptions,
    },
  );
};
