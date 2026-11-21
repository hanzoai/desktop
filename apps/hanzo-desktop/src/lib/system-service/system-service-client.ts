import {
  type QueryObserverOptions,
  useMutation,
  type UseMutationOptions,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';

/**
 * Status of the OS-level "run on startup" service (a systemd USER unit on
 * Linux). Mirrors the `ServiceStatus` struct returned by the Rust commands in
 * `src-tauri/src/commands/service.rs`.
 */
export type SystemServiceStatus = {
  /** Platform supports this install flow at all (Linux + systemd today). */
  supported: boolean;
  /** Unit file exists on disk. */
  installed: boolean;
  /** Enabled to start on login/boot. */
  enabled: boolean;
  /** Currently running. */
  active: boolean;
  /** Absolute path of the unit file (display/debug). */
  unitPath: string;
  /** Human-readable note when unsupported / partially configured. */
  detail?: string | null;
};

// serde serializes the Rust struct with snake_case field names; normalize the
// one camelCase mismatch (`unit_path`) so the rest of the app uses camelCase.
type RawServiceStatus = Omit<SystemServiceStatus, 'unitPath'> & {
  unit_path: string;
};

const normalize = (raw: RawServiceStatus): SystemServiceStatus => ({
  supported: raw.supported,
  installed: raw.installed,
  enabled: raw.enabled,
  active: raw.active,
  unitPath: raw.unit_path,
  detail: raw.detail,
});

export const SYSTEM_SERVICE_STATUS_KEY = ['system_service_status'];

export const useSystemServiceStatusQuery = (
  options?: Omit<
    QueryObserverOptions<SystemServiceStatus, Error>,
    'queryKey' | 'queryFn'
  >,
): UseQueryResult<SystemServiceStatus, Error> => {
  return useQuery({
    queryKey: SYSTEM_SERVICE_STATUS_KEY,
    queryFn: async (): Promise<SystemServiceStatus> => {
      const raw = await invoke<RawServiceStatus>('system_service_status');
      return normalize(raw);
    },
    ...options,
  });
};

export const useInstallSystemServiceMutation = (
  options?: UseMutationOptions<SystemServiceStatus, Error, void>,
) => {
  const queryClient = useQueryClient();
  return useMutation<SystemServiceStatus, Error, void>({
    mutationFn: async (): Promise<SystemServiceStatus> => {
      const raw = await invoke<RawServiceStatus>('install_system_service');
      return normalize(raw);
    },
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: SYSTEM_SERVICE_STATUS_KEY });
      options?.onSuccess?.(...args);
    },
  });
};

export const useUninstallSystemServiceMutation = (
  options?: UseMutationOptions<SystemServiceStatus, Error, void>,
) => {
  const queryClient = useQueryClient();
  return useMutation<SystemServiceStatus, Error, void>({
    mutationFn: async (): Promise<SystemServiceStatus> => {
      const raw = await invoke<RawServiceStatus>('uninstall_system_service');
      return normalize(raw);
    },
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: SYSTEM_SERVICE_STATUS_KEY });
      options?.onSuccess?.(...args);
    },
  });
};
