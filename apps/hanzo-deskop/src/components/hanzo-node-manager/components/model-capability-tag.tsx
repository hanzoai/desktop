import { useTranslation } from '@hanzo_network/hanzo-i18n';
import { Badge } from '@hanzo_network/hanzo-ui';
import { cn } from '@hanzo_network/hanzo-ui/utils';
import { ALargeSmall, Brain, Cloud, Images, Wrench } from 'lucide-react';
import { type ReactNode } from 'react';

import { OllamaModelCapability } from '../../../lib/hanzo-node-manager/ollama-models';

export const ModelCapabilityTag = ({
  className,
  capability,
  ...props
}: {
  capability: OllamaModelCapability;
} & React.HTMLAttributes<HTMLDivElement>) => {
  const { t } = useTranslation();

  const capabilityMap: {
    [key in OllamaModelCapability]: { text: string; icon: ReactNode };
  } = {
    [OllamaModelCapability.ImageToText]: {
      icon: <Images className="h-3.5 w-3.5" />,
      text: t('hanzoNode.models.labels.visionCapability'),
    },
    [OllamaModelCapability.TextGeneration]: {
      icon: <ALargeSmall className="h-3.5 w-3.5" />,
      text: t('hanzoNode.models.labels.textCapability'),
    },
    [OllamaModelCapability.Thinking]: {
      icon: <Brain className="h-3.5 w-3.5" />,
      text: t('hanzoNode.models.labels.thinkingCapability'),
    },
    [OllamaModelCapability.ToolCalling]: {
      icon: <Wrench className="h-3.5 w-3.5" />,
      text: t('hanzoNode.models.labels.toolCallingCapability'),
    },
    [OllamaModelCapability.Cloud]: {
      icon: <Cloud className="h-3.5 w-3.5" />,
      text: t('hanzoNode.models.labels.cloudCapability'),
    },
  };
  return (
    <Badge className={cn(className)} variant="tags" {...props}>
      {capabilityMap[capability].icon}
      <span className="ml-2">{capabilityMap[capability].text}</span>
    </Badge>
  );
};
