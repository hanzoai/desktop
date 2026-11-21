import {
  type QueryObserverOptions,
  useMutation,
  type UseMutationOptions,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { debug, warn } from '@tauri-apps/plugin-log';
import { platform } from '@tauri-apps/plugin-os';
import { relaunch } from '@tauri-apps/plugin-process';
import { check, type Update } from '@tauri-apps/plugin-updater';

import { useHanzoNodeKillMutation } from '../hanzo-node-manager/hanzo-node-manager-client';

// ---------------------------------------------------------------------------
// Environment introspection (TASK 3 hardening)
// ---------------------------------------------------------------------------

/**
 * How this build is installed and whether a Tauri self-update is viable.
 * Mirrors the `UpdaterEnvironment` struct returned by the Rust command
 * `updater_environment` (see `src-tauri/src/commands/updater_env.rs`).
 *
 * On Linux the Tauri updater can ONLY update an AppImage; for a .deb / system
 * install / dev build there is nothing safe to self-replace, so we no-op
 * gracefully instead of letting the updater throw.
 */
export type UpdaterEnvironment = {
  canSelfUpdate: boolean;
  isAppimage: boolean;
  appimagePath?: string | null;
  appimageWritable: boolean;
  underSystemdService: boolean;
  installKind:
    | 'appimage'
    | 'deb-or-system'
    | 'dev'
    | 'macos'
    | 'windows'
    | 'unknown';
  managedNote?: string | null;
  manualDownloadUrl: string;
};

type RawUpdaterEnvironment = {
  can_self_update: boolean;
  is_appimage: boolean;
  appimage_path?: string | null;
  appimage_writable: boolean;
  under_systemd_service: boolean;
  install_kind: UpdaterEnvironment['installKind'];
  managed_note?: string | null;
  manual_download_url: string;
};

const normalizeEnv = (raw: RawUpdaterEnvironment): UpdaterEnvironment => ({
  canSelfUpdate: raw.can_self_update,
  isAppimage: raw.is_appimage,
  appimagePath: raw.appimage_path,
  appimageWritable: raw.appimage_writable,
  underSystemdService: raw.under_systemd_service,
  installKind: raw.install_kind,
  managedNote: raw.managed_note,
  manualDownloadUrl: raw.manual_download_url,
});

let cachedEnv: UpdaterEnvironment | null = null;

/** Fetch (and memoize) the updater environment from the Rust backend. */
export const getUpdaterEnvironment =
  async (): Promise<UpdaterEnvironment | null> => {
    if (cachedEnv) return cachedEnv;
    try {
      const raw = await invoke<RawUpdaterEnvironment>('updater_environment');
      cachedEnv = normalizeEnv(raw);
      return cachedEnv;
    } catch (e) {
      // Backend command missing (e.g. very old build) — fail open so the
      // updater still attempts a check rather than hard-blocking.
      void warn(
        `updater_environment unavailable: ${e instanceof Error ? e.message : String(e)}`,
      );
      return null;
    }
  };

export const useUpdaterEnvironmentQuery = (
  options?: Omit<
    QueryObserverOptions<UpdaterEnvironment | null, Error>,
    'queryKey' | 'queryFn'
  >,
): UseQueryResult<UpdaterEnvironment | null, Error> => {
  return useQuery({
    queryKey: ['updater_environment'],
    queryFn: getUpdaterEnvironment,
    staleTime: Infinity, // install shape doesn't change at runtime
    ...options,
  });
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Strict semver "greater than" comparison for the downgrade guard. Returns true
 * iff `candidate` is strictly newer than `current`. Pre-release/build metadata
 * is ignored for this coarse guard (the updater's own check already handles the
 * precise case; this is a belt-and-suspenders check so we NEVER apply an
 * older-or-equal version even if a feed is misconfigured).
 */
export const isStrictlyNewer = (candidate: string, current: string): boolean => {
  const parse = (v: string): number[] =>
    v
      .trim()
      .replace(/^v/i, '')
      .split('-')[0] // drop pre-release
      .split('.')
      .map((n) => Number.parseInt(n, 10) || 0);
  const a = parse(candidate);
  const b = parse(current);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    if (ai > bi) return true;
    if (ai < bi) return false;
  }
  return false; // equal → NOT newer
};

/**
 * Classify an error from `check()` / `downloadAndInstall()`.
 * - `offline`: no network — checks should fail silently on startup.
 * - `signature`: minisign verification failed (key mismatch / tampering) — we
 *   reject the update and never apply it.
 * - `permission`: couldn't write the target (read-only AppImage path).
 * - `other`: anything else.
 */
type UpdateErrorKind = 'offline' | 'signature' | 'permission' | 'other';

const classifyUpdateError = (error: unknown): UpdateErrorKind => {
  const msg = (error instanceof Error ? error.message : String(error)) || '';
  const lower = msg.toLowerCase();
  if (
    lower.includes('unexpectedkeyid') ||
    lower.includes('signature') ||
    lower.includes('minisign') ||
    lower.includes('verify')
  ) {
    return 'signature';
  }
  if (
    lower.includes('failed to lookup') || // DNS
    lower.includes('dns') ||
    lower.includes('connection') ||
    lower.includes('connect') ||
    lower.includes('network') ||
    lower.includes('timed out') ||
    lower.includes('timeout') ||
    lower.includes('offline') ||
    lower.includes('error sending request') ||
    lower.includes('os error 11') // EAGAIN / temporary failure
  ) {
    return 'offline';
  }
  if (
    lower.includes('permission denied') ||
    lower.includes('read-only') ||
    lower.includes('readonly') ||
    lower.includes('os error 13') || // EACCES
    lower.includes('os error 30') // EROFS
  ) {
    return 'permission';
  }
  return 'other';
};

// ---------------------------------------------------------------------------
// Types / singleton state
// ---------------------------------------------------------------------------

export type DownloadState = {
  state: 'started' | 'downloading' | 'finished';
  data: {
    contentLength?: number;
    lastChunkLength?: number;
    accumulatedLength?: number;
    downloadProgressPercent?: number;
  };
} | null;

export type UpdateState = {
  state?: 'available' | 'downloading' | 'restarting';
  update?: Update | null;
  downloadState?: DownloadState;
  /**
   * Set when self-update can't proceed for this install shape (managed by a
   * package manager, read-only AppImage, etc). The UI should show this as an
   * informational notice + manual-download link rather than an error.
   */
  notice?: {
    kind: 'managed' | 'not-writable' | 'signature' | 'error';
    message: string;
    manualDownloadUrl?: string;
  };
};

// Singleton state shared across all observers (mirrors prior design).
const updateState: UpdateState = {};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const useUpdateStateQuery = (
  options?: Omit<
    QueryObserverOptions<UpdateState | null, Error>,
    'queryKey' | 'queryFn'
  >,
): UseQueryResult<UpdateState | null, Error> => {
  return useQuery({
    queryKey: ['update_state'],
    queryFn: async () => updateState,
    notifyOnChangeProps: 'all',
    ...options,
  });
};

export const useCheckUpdateQuery = (
  options?: Omit<
    QueryObserverOptions<UpdateState | null, Error>,
    'queryKey' | 'queryFn'
  >,
): UseQueryResult<UpdateState | null, Error> => {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ['check_update'],
    queryFn: async () => {
      if (updateState.update) {
        return updateState;
      }

      // 1) Decide whether a self-update is even possible for this install.
      //    Not an AppImage (dev / .deb / system install) → no-op gracefully
      //    with an optional "managed by your package manager" notice. No error
      //    toast, no failed updater call.
      const env = await getUpdaterEnvironment();
      if (env && !env.canSelfUpdate) {
        updateState.state = undefined;
        updateState.update = null;
        updateState.notice = env.managedNote
          ? {
              kind: env.installKind === 'appimage' ? 'not-writable' : 'managed',
              message: env.managedNote,
              manualDownloadUrl: env.manualDownloadUrl,
            }
          : undefined;
        void debug(
          `self-update unavailable (installKind=${env.installKind}); skipping check`,
        );
        void queryClient.invalidateQueries({ queryKey: ['update_state'] });
        return updateState;
      }

      // 2) Run the actual check. `allowDowngrades` stays false so Tauri's own
      //    comparison won't surface older versions; we ALSO guard explicitly
      //    below.
      try {
        const update = await check({ allowDowngrades: false });
        void debug(`check update available:${update?.available}`);

        // 3) Downgrade guard: only ever treat strictly-newer as available.
        if (
          update &&
          update.version &&
          update.currentVersion &&
          !isStrictlyNewer(update.version, update.currentVersion)
        ) {
          void warn(
            `ignoring non-newer update ${update.currentVersion} -> ${update.version}`,
          );
          await update.close().catch(() => undefined);
          updateState.state = undefined;
          updateState.update = null;
          void queryClient.invalidateQueries({ queryKey: ['update_state'] });
          return updateState;
        }

        updateState.state = update ? 'available' : undefined;
        updateState.update = update;
        updateState.notice = undefined;
        void queryClient.invalidateQueries({ queryKey: ['update_state'] });
        return updateState;
      } catch (error) {
        const kind = classifyUpdateError(error);
        const errorMsg = error instanceof Error ? error.message : String(error);
        void debug(`Failed to check for updates (${kind}): ${errorMsg}`);

        updateState.state = undefined;
        updateState.update = null;

        switch (kind) {
          case 'offline':
            // Startup check while offline: skip silently, no notice.
            updateState.notice = undefined;
            break;
          case 'signature':
            // Verification failed → never apply. In dev this is expected
            // (unsigned local builds); only surface a notice in production.
            console.info(
              'Update signature verification failed (rejecting update).',
            );
            updateState.notice = {
              kind: 'signature',
              message:
                'A new build was found but its signature could not be verified, so it was not installed. Please download the latest version manually.',
              manualDownloadUrl: env?.manualDownloadUrl,
            };
            break;
          case 'permission':
            updateState.notice = {
              kind: 'not-writable',
              message:
                env?.managedNote ??
                "Hanzo couldn't update itself because its install location isn't writable. Please download the latest version manually.",
              manualDownloadUrl: env?.manualDownloadUrl,
            };
            break;
          default:
            console.warn('Failed to check for updates:', errorMsg);
            updateState.notice = undefined;
            break;
        }
        void queryClient.invalidateQueries({ queryKey: ['update_state'] });
        return updateState;
      }
    },
    ...options,
  });
};

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export const useDownloadUpdateMutation = (options?: UseMutationOptions) => {
  const queryClient = useQueryClient();
  const { mutateAsync: hanzoNodeKill } = useHanzoNodeKillMutation();

  return useMutation({
    mutationFn: async (): Promise<void> => {
      if (!updateState.update?.available) {
        void debug(`update not available`);
        return;
      }
      if (updateState.downloadState) {
        void debug(
          `update already in progress ${JSON.stringify(updateState.downloadState)}`,
        );
        return;
      }

      // Re-confirm the environment right before mutating the install. This is
      // the last gate before we touch disk: if the AppImage path went
      // read-only (or this isn't an updatable install), bail with a friendly
      // notice instead of half-applying.
      const env = await getUpdaterEnvironment();
      if (env && !env.canSelfUpdate) {
        updateState.state = undefined;
        updateState.notice = {
          kind: env.isAppimage ? 'not-writable' : 'managed',
          message:
            env.managedNote ??
            'This installation cannot update itself. Please download the latest version manually.',
          manualDownloadUrl: env.manualDownloadUrl,
        };
        void queryClient.invalidateQueries({ queryKey: ['update_state'] });
        // Surface to the caller's onError so the Settings toast can show.
        throw new Error(updateState.notice.message);
      }

      try {
        updateState.state = 'downloading';
        updateState.notice = undefined;
        await queryClient.invalidateQueries({ queryKey: ['update_state'] });
        // downloadAndInstall downloads to a TEMP file, verifies the minisign
        // signature against the configured pubkey, and only then atomically
        // swaps it into place — so a partial/failed download never corrupts the
        // running install. We surface progress and tear down the node once the
        // bytes are on disk (just before the swap/restart).
        await updateState.update.downloadAndInstall((downloadEvent) => {
          switch (downloadEvent.event) {
            case 'Started':
              updateState.downloadState = {
                state: 'started',
                data: { contentLength: downloadEvent.data.contentLength },
              };
              break;
            case 'Progress': {
              const newDownloadProgress = updateState.downloadState?.data
                ?.contentLength
                ? Math.round(
                    (((updateState.downloadState?.data?.accumulatedLength ||
                      0) +
                      downloadEvent.data.chunkLength) /
                      updateState.downloadState.data.contentLength) *
                      100,
                  )
                : 0;
              updateState.downloadState = {
                state: 'downloading',
                data: {
                  contentLength: updateState.downloadState?.data?.contentLength,
                  lastChunkLength: downloadEvent.data.chunkLength,
                  accumulatedLength:
                    (updateState.downloadState?.data?.accumulatedLength || 0) +
                    downloadEvent.data.chunkLength,
                  downloadProgressPercent: newDownloadProgress,
                },
              };
              break;
            }
            case 'Finished':
              updateState.downloadState = {
                state: 'finished',
                data: {
                  ...updateState.downloadState?.data,
                  downloadProgressPercent: 100,
                },
              };
              void hanzoNodeKill();
              break;
          }
          void queryClient.invalidateQueries(
            { queryKey: ['update_state'] },
            { cancelRefetch: false },
          );
        });
      } catch (e) {
        const kind = classifyUpdateError(e);
        console.error('Error downloading update', e);
        // Roll the UI back to "available" so the user can retry. The install is
        // untouched (atomic swap only happens after a verified full download).
        updateState.state = updateState.update ? 'available' : undefined;
        updateState.downloadState = undefined;
        if (kind === 'signature') {
          updateState.notice = {
            kind: 'signature',
            message:
              'The downloaded update failed signature verification and was discarded. Your current version is unchanged.',
            manualDownloadUrl: env?.manualDownloadUrl,
          };
        } else if (kind === 'permission') {
          updateState.notice = {
            kind: 'not-writable',
            message:
              "Couldn't write the update (install location not writable). Your current version is unchanged.",
            manualDownloadUrl: env?.manualDownloadUrl,
          };
        }
        void queryClient.invalidateQueries({ queryKey: ['update_state'] });
        // Re-throw so the caller's onError handler runs (toast in Settings).
        throw e instanceof Error ? e : new Error(String(e));
      }

      updateState.state = 'restarting';
      void queryClient.invalidateQueries({ queryKey: ['update_state'] });

      // Restart strategy:
      // - Running under the systemd user service → ask systemd to restart the
      //   unit (a bare relaunch would detach from systemd and fight
      //   Restart=always). `restart_system_service` returns true when it issued
      //   the restart.
      // - Otherwise → normal relaunch (skipped on Windows, whose installer
      //   relaunches on its own).
      try {
        const restartedViaSystemd = await invoke<boolean>(
          'restart_system_service',
        );
        if (restartedViaSystemd) {
          void debug('update applied; restarting via systemd user service');
          return;
        }
      } catch (e) {
        void warn(
          `restart_system_service failed, falling back to relaunch: ${e instanceof Error ? e.message : String(e)}`,
        );
      }

      if (platform() !== 'windows') {
        await relaunch();
      }
    },
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({
        queryKey: ['check_update', 'update_state'],
      });
      options?.onSuccess?.(...args);
    },
  });
};
