import { useTranslation } from '@hanzo_network/hanzo-i18n';
import {
  Badge,
  Button,
  CardFooter,
  ScrollArea,
  Tooltip,
  TooltipContent,
  TooltipPortal,
  TooltipProvider,
  TooltipTrigger,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@hanzo_network/hanzo-ui';

import { cn } from '@hanzo_network/hanzo-ui/utils';
import { BookOpenText, Database, Sparkles, StarIcon } from 'lucide-react';
import React, { useState } from 'react';
import AutoSizer from 'react-virtualized-auto-sizer';

import { OLLAMA_MODELS } from '../../lib/hanzo-node-manager/ollama-models';
import {
  useHanzoNodeGetDefaultModel,
  useHanzoNodeIsRunningQuery,
  useHanzoNodeSpawnMutation,
} from '../../lib/hanzo-node-manager/hanzo-node-manager-client';
import ProviderIcon from '../ais/provider-icon';
import { ModelCapabilityTag } from './components/model-capability-tag';
import { ModelQuailityTag } from './components/model-quality-tag';
import { ModelSpeedTag } from './components/model-speed-tag';
import { OllamaModelInstallButton } from './components/ollama-model-install-button';
import { OllamaModelsRepository } from './components/ollama-models-repository';

export const OllamaModels = ({
  rightBottomElement,
  parentShowAllOllamaModels,
  parentSetShowAllOllamaModels,
}: {
  rightBottomElement?: React.ReactNode;
  parentShowAllOllamaModels?: boolean;
  parentSetShowAllOllamaModels?: (value: boolean) => void;
}) => {
  const { t } = useTranslation();
  const { data: defaultModel } = useHanzoNodeGetDefaultModel();

  const { data: isHanzoNodeRunning } = useHanzoNodeIsRunningQuery();
  const { mutateAsync: hanzoNodeSpawn } = useHanzoNodeSpawnMutation({});
  const [internalShowAllOllamaModels, setInternalShowAllOllamaModels] =
    useState(false);

  const showAllOllamaModels =
    parentShowAllOllamaModels ?? internalShowAllOllamaModels;
  const setShowAllOllamaModels =
    parentSetShowAllOllamaModels ?? setInternalShowAllOllamaModels;

  const isDefaultModel = (model: string): boolean => {
    return defaultModel === model;
  };

  if (!isHanzoNodeRunning) {
    return (
      <div className="flex h-full w-full flex-row items-center justify-center">
        <div className="text-text-secondary">
          <span
            className={cn('cursor-pointer text-white underline')}
            onClick={() => {
              if (isHanzoNodeRunning) {
                return;
              }
              void hanzoNodeSpawn();
            }}
          >
            Start
          </span>{' '}
          Hanzo Node to manage your AI models
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-1.5 pb-2',
        showAllOllamaModels && 'h-full',
      )}
    >
      {!showAllOllamaModels && (
        <ScrollArea className="mt-1 flex flex-1 flex-col overflow-auto [&>div>div]:!block">
          <div className="grid grid-cols-4 gap-4">
            {OLLAMA_MODELS.map((model) => {
              return (
                <Card
                  className="gap- flex flex-col rounded-2xl"
                  key={model.fullName}
                >
                  <CardHeader className="relative">
                    <CardTitle className="text-md mb-3 flex flex-col gap-1">
                      <span className="p-2">
                        <ProviderIcon
                          className="h-6 w-6"
                          provider={model.provider}
                        />
                      </span>

                      <span>
                        <span className="font-inter text-xl font-semibold">
                          {model.name}
                        </span>
                        {isDefaultModel(model.fullName) && (
                          <TooltipProvider delayDuration={0}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge
                                  className={cn(
                                    'border-brand ml-2 flex inline-flex h-5 w-5 items-center justify-center rounded-full border p-0 font-medium',
                                  )}
                                >
                                  <StarIcon className="text-brand size-3" />
                                </Badge>
                              </TooltipTrigger>
                              <TooltipPortal>
                                <TooltipContent align="center" side="top">
                                  {t('common.recommended')}
                                </TooltipContent>
                              </TooltipPortal>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </span>
                    </CardTitle>
                    <CardDescription className="overflow-hidden text-xs text-ellipsis">
                      {model.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col items-center gap-1 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      {model.capabilities.map((capability) => (
                        <ModelCapabilityTag
                          capability={capability}
                          key={capability}
                        />
                      ))}
                      <ModelQuailityTag quality={model.quality} />
                      <ModelSpeedTag speed={model.speed} />
                      <Badge variant="tags">
                        <BookOpenText className="h-3.5 w-3.5" />
                        <span className="ml-2 overflow-hidden text-ellipsis">
                          {t('hanzoNode.models.labels.bookPages', {
                            pages: Math.round(
                              (model.contextLength * 0.75) / 380,
                            ),
                          })}
                        </span>
                      </Badge>
                      <Badge variant="tags">
                        <Database className="mr-2 h-4 w-4" />
                        <span className="text-ellipsis">{model.size} GB</span>
                      </Badge>
                    </div>
                  </CardContent>
                  <CardFooter className="mt-auto">
                    <OllamaModelInstallButton model={model.fullName} />
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        </ScrollArea>
      )}

      {showAllOllamaModels && (
        <div className="h-full w-full">
          <AutoSizer>
            {({ height, width }) => (
              <OllamaModelsRepository style={{ height, width }} />
            )}
          </AutoSizer>
        </div>
      )}
      <span className="text-text-secondary w-full pt-2 text-right text-xs">
        {t('hanzoNode.models.poweredByOllama')}
      </span>
      {parentShowAllOllamaModels == null && (
        <div
          className={cn(
            'flex w-full items-center justify-center gap-4 pt-8 pb-4',
            rightBottomElement && 'justify-between',
          )}
        >
          {rightBottomElement && <div className="w-[124px]" />}
          <Button
            className={cn('gap-2 rounded-lg px-6')}
            onClick={() => setShowAllOllamaModels(!showAllOllamaModels)}
            size="sm"
            variant="outline"
          >
            <Sparkles className="h-4 w-4" />
            <span className="capitalize">
              {showAllOllamaModels
                ? t('hanzoNode.models.labels.showRecommended')
                : t('hanzoNode.models.labels.showAll')}
            </span>
          </Button>
          {rightBottomElement}
        </div>
      )}
    </div>
  );
};
