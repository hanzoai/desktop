/**
 * Model Tools client
 *
 * Frontend bindings for the `hanzo-ml` model tools exposed by the Tauri backend
 * (see `src-tauri/src/model_tools`). These drive:
 *
 * - **Model soups + BitDelta** via the `soup` CLI (`hanzo_ml::model_delta`):
 *   average checkpoints, delta-soup, and 1-bit BitDelta encode/apply.
 * - **GRPO** (`hanzo_training::grpo`) — a developer-preview entry that runs the
 *   trainer-free GRPO example from a local `hanzoai/ml` checkout.
 *
 * All calls go through Tauri `invoke`, matching the pattern used by
 * `hanzo-node-manager-client.ts`.
 */

import {
  useMutation,
  useQuery,
  type UseMutationOptions,
  type UseQueryResult,
} from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';

// ---------------------------------------------------------------------------
// Types (mirror the Rust structs in model_tools/soup.rs)
// ---------------------------------------------------------------------------

export interface SoupAverageArgs {
  /** Input checkpoints to average (>= 1), as safetensors paths. */
  models: string[];
  /** Output safetensors path. */
  out: string;
  /** Optional per-model weights (normalised internally). Omit for uniform. */
  weights?: number[] | null;
}

export interface SoupDeltaArgs {
  /** Base checkpoint. */
  base: string;
  /** Fine-tuned checkpoints (>= 1). */
  finetunes: string[];
  /** Output safetensors path. */
  out: string;
}

export interface BitDeltaEncodeArgs {
  /** Base checkpoint. */
  base: string;
  /** Fine-tuned checkpoint to compress. */
  finetuned: string;
  /** Output `.bitdelta` path. */
  out: string;
}

export interface BitDeltaApplyArgs {
  /** Base checkpoint. */
  base: string;
  /** Input `.bitdelta` file. */
  delta: string;
  /** Output safetensors path. */
  out: string;
}

export interface GrpoRunArgs {
  /** Group size G (completions sampled per prompt). */
  group_size?: number | null;
  /** Number of optimization steps to run. */
  steps?: number | null;
}

// ---------------------------------------------------------------------------
// Raw invoke wrappers
// ---------------------------------------------------------------------------

export const isSoupAvailable = (): Promise<boolean> =>
  invoke('model_tools_soup_available');

export const soupAverage = (args: SoupAverageArgs): Promise<string> =>
  invoke('model_tools_soup_average', { args });

export const soupDelta = (args: SoupDeltaArgs): Promise<string> =>
  invoke('model_tools_soup_delta', { args });

export const bitDeltaEncode = (args: BitDeltaEncodeArgs): Promise<string> =>
  invoke('model_tools_bitdelta_encode', { args });

export const bitDeltaApply = (args: BitDeltaApplyArgs): Promise<string> =>
  invoke('model_tools_bitdelta_apply', { args });

export const grpoRun = (args: GrpoRunArgs): Promise<string> =>
  invoke('model_tools_grpo_run', { args });

// ---------------------------------------------------------------------------
// React Query hooks
// ---------------------------------------------------------------------------

export const useSoupAvailableQuery = (): UseQueryResult<boolean, Error> => {
  const query = useQuery({
    queryKey: ['model_tools_soup_available'],
    queryFn: (): Promise<boolean> => isSoupAvailable(),
  });
  return { ...query } as UseQueryResult<boolean, Error>;
};

export const useSoupAverageMutation = (
  options?: UseMutationOptions<string, Error, SoupAverageArgs>,
) => useMutation({ mutationFn: soupAverage, ...options });

export const useSoupDeltaMutation = (
  options?: UseMutationOptions<string, Error, SoupDeltaArgs>,
) => useMutation({ mutationFn: soupDelta, ...options });

export const useBitDeltaEncodeMutation = (
  options?: UseMutationOptions<string, Error, BitDeltaEncodeArgs>,
) => useMutation({ mutationFn: bitDeltaEncode, ...options });

export const useBitDeltaApplyMutation = (
  options?: UseMutationOptions<string, Error, BitDeltaApplyArgs>,
) => useMutation({ mutationFn: bitDeltaApply, ...options });

export const useGrpoRunMutation = (
  options?: UseMutationOptions<string, Error, GrpoRunArgs>,
) => useMutation({ mutationFn: grpoRun, ...options });
