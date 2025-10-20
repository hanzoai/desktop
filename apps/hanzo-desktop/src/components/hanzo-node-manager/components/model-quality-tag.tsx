import { t } from '@hanzo_network/hanzo-i18n';
import { Badge } from '@hanzo_network/hanzo-ui';
import { cn } from '@hanzo_network/hanzo-ui/utils';
import { Sparkles } from 'lucide-react';

import { type OllamaModelQuality } from '../../../lib/hanzo-node-manager/ollama-models';

export const ModelQuailityTag = ({
  className,
  quality,
  ...props
}: {
  quality: OllamaModelQuality;
} & React.HTMLAttributes<HTMLDivElement>) => {
  return (
    <Badge className={cn(className)} variant="tags" {...props}>
      <Sparkles className="h-4 w-4" />
      <span className="ml-2">
        {quality} {t('hanzoNode.models.labels.quality')}
      </span>
    </Badge>
  );
};
