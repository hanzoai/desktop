import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  ScrollArea,
} from '@hanzo_network/hanzo-ui';
import { cn } from '@hanzo_network/hanzo-ui/utils';
import { Loader2, Layers, Minimize2, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import {
  useBitDeltaApplyMutation,
  useBitDeltaEncodeMutation,
  useGrpoRunMutation,
  useSoupAverageMutation,
  useSoupAvailableQuery,
  useSoupDeltaMutation,
} from '../../lib/model-tools/model-tools-client';

/**
 * Model Tools — checkpoint merging / compression (model soups + BitDelta) and a
 * developer-preview entry for trainer-free GRPO. These shell out to the
 * `hanzo-ml` `soup` CLI and the `hanzo_training::grpo` example via the Tauri
 * backend (`src-tauri/src/model_tools`).
 *
 * Inputs are file paths (kept deliberately simple): safetensors checkpoints in,
 * a merged safetensors / `.bitdelta` out. The CLI's stdout is surfaced as a
 * success toast and in the output box; errors (including a missing `soup`
 * binary) are surfaced verbatim.
 */
export const ModelTools = ({ className }: { className?: string }) => {
  const { data: soupAvailable, isPending: checkingSoup } =
    useSoupAvailableQuery();

  const [lastOutput, setLastOutput] = useState<string>('');

  const onResult = (label: string) => (out: string) => {
    setLastOutput(`${label}\n${out}`.trim());
    toast.success(`${label} complete`, { description: out || undefined });
  };
  const onError = (label: string) => (err: Error) => {
    setLastOutput(`${label} FAILED\n${err.message}`.trim());
    toast.error(`${label} failed`, { description: err.message });
  };

  // --- Average (model soup) ---
  const [avgModels, setAvgModels] = useState('');
  const [avgWeights, setAvgWeights] = useState('');
  const [avgOut, setAvgOut] = useState('');
  const averageMutation = useSoupAverageMutation({
    onSuccess: onResult('Model soup (average)'),
    onError: onError('Model soup (average)'),
  });

  // --- Delta soup ---
  const [deltaBase, setDeltaBase] = useState('');
  const [deltaFinetunes, setDeltaFinetunes] = useState('');
  const [deltaOut, setDeltaOut] = useState('');
  const deltaMutation = useSoupDeltaMutation({
    onSuccess: onResult('Delta soup'),
    onError: onError('Delta soup'),
  });

  // --- BitDelta encode ---
  const [encBase, setEncBase] = useState('');
  const [encFinetuned, setEncFinetuned] = useState('');
  const [encOut, setEncOut] = useState('');
  const encodeMutation = useBitDeltaEncodeMutation({
    onSuccess: onResult('BitDelta encode'),
    onError: onError('BitDelta encode'),
  });

  // --- BitDelta apply ---
  const [appBase, setAppBase] = useState('');
  const [appDelta, setAppDelta] = useState('');
  const [appOut, setAppOut] = useState('');
  const applyMutation = useBitDeltaApplyMutation({
    onSuccess: onResult('BitDelta apply'),
    onError: onError('BitDelta apply'),
  });

  // --- GRPO (developer preview) ---
  const [grpoGroupSize, setGrpoGroupSize] = useState('');
  const [grpoSteps, setGrpoSteps] = useState('');
  const grpoMutation = useGrpoRunMutation({
    onSuccess: onResult('GRPO run'),
    onError: onError('GRPO run'),
  });

  const splitPaths = (s: string) =>
    s
      .split(/[\n,]/)
      .map((p) => p.trim())
      .filter(Boolean);

  const parseWeights = (s: string): number[] | null => {
    const parts = splitPaths(s).map(Number);
    if (parts.length === 0 || parts.some((n) => Number.isNaN(n))) return null;
    return parts;
  };

  const soupDisabled = !soupAvailable;

  return (
    <ScrollArea className={cn('h-full', className)}>
      <div className="flex flex-col gap-4 pr-3 pb-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-medium">Model Tools</h2>
          <p className="text-text-secondary text-xs">
            Merge and compress checkpoints with model soups and 1-bit BitDelta
            (powered by hanzo-ml). Paths are safetensors checkpoints on this
            machine.
          </p>
          {!checkingSoup && soupDisabled && (
            <p className="mt-1 text-xs text-yellow-500">
              The <code>soup</code> CLI was not found. Build it from the
              hanzoai/ml repo (<code>cargo build -p tensor-tools --bin soup</code>
              ) and put it on PATH, or set <code>HANZO_SOUP_BIN</code>.
            </p>
          )}
        </div>

        {/* Model soup (average) */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 p-4 pb-2">
            <Layers className="size-4" />
            <div className="flex flex-col">
              <CardTitle className="text-sm">Model soup (average)</CardTitle>
              <CardDescription className="text-xs">
                Average matching tensors across checkpoints into one model.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 p-4 pt-0">
            <Label className="text-xs">Checkpoints (one per line or comma-separated)</Label>
            <textarea
              className="bg-bg-secondary min-h-16 rounded-md p-2 text-xs"
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setAvgModels(e.target.value)
              }
              placeholder="/models/a.safetensors&#10;/models/b.safetensors"
              value={avgModels}
            />
            <Label className="text-xs">Weights (optional, e.g. 1,3,1)</Label>
            <Input
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAvgWeights(e.target.value)}
              placeholder="leave blank for a uniform average"
              value={avgWeights}
            />
            <Label className="text-xs">Output path</Label>
            <Input
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAvgOut(e.target.value)}
              placeholder="/models/merged.safetensors"
              value={avgOut}
            />
            <Button
              className="mt-1 w-fit"
              disabled={
                soupDisabled ||
                averageMutation.isPending ||
                !avgOut ||
                splitPaths(avgModels).length === 0
              }
              onClick={() =>
                averageMutation.mutate({
                  models: splitPaths(avgModels),
                  out: avgOut,
                  weights: avgWeights ? parseWeights(avgWeights) : null,
                })
              }
              size="sm"
            >
              {averageMutation.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              Average
            </Button>
          </CardContent>
        </Card>

        {/* Delta soup */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 p-4 pb-2">
            <Layers className="size-4" />
            <div className="flex flex-col">
              <CardTitle className="text-sm">Delta soup</CardTitle>
              <CardDescription className="text-xs">
                base + mean(fine-tune − base) across several fine-tunes.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 p-4 pt-0">
            <Label className="text-xs">Base checkpoint</Label>
            <Input
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDeltaBase(e.target.value)}
              placeholder="/models/base.safetensors"
              value={deltaBase}
            />
            <Label className="text-xs">Fine-tunes (one per line or comma-separated)</Label>
            <textarea
              className="bg-bg-secondary min-h-16 rounded-md p-2 text-xs"
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setDeltaFinetunes(e.target.value)
              }
              placeholder="/models/ft1.safetensors&#10;/models/ft2.safetensors"
              value={deltaFinetunes}
            />
            <Label className="text-xs">Output path</Label>
            <Input
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDeltaOut(e.target.value)}
              placeholder="/models/merged.safetensors"
              value={deltaOut}
            />
            <Button
              className="mt-1 w-fit"
              disabled={
                soupDisabled ||
                deltaMutation.isPending ||
                !deltaBase ||
                !deltaOut ||
                splitPaths(deltaFinetunes).length === 0
              }
              onClick={() =>
                deltaMutation.mutate({
                  base: deltaBase,
                  finetunes: splitPaths(deltaFinetunes),
                  out: deltaOut,
                })
              }
              size="sm"
            >
              {deltaMutation.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              Delta soup
            </Button>
          </CardContent>
        </Card>

        {/* BitDelta encode */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 p-4 pb-2">
            <Minimize2 className="size-4" />
            <div className="flex flex-col">
              <CardTitle className="text-sm">BitDelta — compress</CardTitle>
              <CardDescription className="text-xs">
                Store a fine-tune as a ~1-bit delta against a base.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 p-4 pt-0">
            <Label className="text-xs">Base checkpoint</Label>
            <Input
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEncBase(e.target.value)}
              placeholder="/models/base.safetensors"
              value={encBase}
            />
            <Label className="text-xs">Fine-tuned checkpoint</Label>
            <Input
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEncFinetuned(e.target.value)}
              placeholder="/models/ft.safetensors"
              value={encFinetuned}
            />
            <Label className="text-xs">Output .bitdelta path</Label>
            <Input
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEncOut(e.target.value)}
              placeholder="/models/ft.bitdelta"
              value={encOut}
            />
            <Button
              className="mt-1 w-fit"
              disabled={
                soupDisabled ||
                encodeMutation.isPending ||
                !encBase ||
                !encFinetuned ||
                !encOut
              }
              onClick={() =>
                encodeMutation.mutate({
                  base: encBase,
                  finetuned: encFinetuned,
                  out: encOut,
                })
              }
              size="sm"
            >
              {encodeMutation.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              Encode
            </Button>
          </CardContent>
        </Card>

        {/* BitDelta apply */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 p-4 pb-2">
            <Minimize2 className="size-4" />
            <div className="flex flex-col">
              <CardTitle className="text-sm">BitDelta — restore</CardTitle>
              <CardDescription className="text-xs">
                Reconstruct a fine-tune from base + a `.bitdelta`.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 p-4 pt-0">
            <Label className="text-xs">Base checkpoint</Label>
            <Input
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAppBase(e.target.value)}
              placeholder="/models/base.safetensors"
              value={appBase}
            />
            <Label className="text-xs">.bitdelta file</Label>
            <Input
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAppDelta(e.target.value)}
              placeholder="/models/ft.bitdelta"
              value={appDelta}
            />
            <Label className="text-xs">Output path</Label>
            <Input
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAppOut(e.target.value)}
              placeholder="/models/restored.safetensors"
              value={appOut}
            />
            <Button
              className="mt-1 w-fit"
              disabled={
                soupDisabled ||
                applyMutation.isPending ||
                !appBase ||
                !appDelta ||
                !appOut
              }
              onClick={() =>
                applyMutation.mutate({
                  base: appBase,
                  delta: appDelta,
                  out: appOut,
                })
              }
              size="sm"
            >
              {applyMutation.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              Restore
            </Button>
          </CardContent>
        </Card>

        {/* GRPO (developer preview) */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 p-4 pb-2">
            <Sparkles className="size-4" />
            <div className="flex flex-col">
              <CardTitle className="text-sm">
                GRPO training (developer preview)
              </CardTitle>
              <CardDescription className="text-xs">
                Runs the trainer-free GRPO example from a local hanzoai/ml
                checkout. Requires <code>HANZO_ML_DIR</code>; there is no GRPO
                daemon yet, so this is a developer-only path.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 p-4 pt-0">
            <Label className="text-xs">Group size (optional)</Label>
            <Input
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setGrpoGroupSize(e.target.value)}
              placeholder="e.g. 8"
              value={grpoGroupSize}
            />
            <Label className="text-xs">Steps (optional)</Label>
            <Input
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setGrpoSteps(e.target.value)}
              placeholder="e.g. 50"
              value={grpoSteps}
            />
            <Button
              className="mt-1 w-fit"
              disabled={grpoMutation.isPending}
              onClick={() =>
                grpoMutation.mutate({
                  group_size: grpoGroupSize ? Number(grpoGroupSize) : null,
                  steps: grpoSteps ? Number(grpoSteps) : null,
                })
              }
              size="sm"
              variant="outline"
            >
              {grpoMutation.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              Run GRPO example
            </Button>
          </CardContent>
        </Card>

        {/* Output */}
        {lastOutput && (
          <Card>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm">Last result</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <pre className="bg-bg-secondary max-h-48 overflow-auto rounded-md p-2 text-xs whitespace-pre-wrap">
                {lastOutput}
              </pre>
            </CardContent>
          </Card>
        )}
      </div>
    </ScrollArea>
  );
};
