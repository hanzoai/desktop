import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '../store/auth';
import { safeInvoke } from '../utils/tauri-check';

export type GpuConnectState = {
  connected: boolean;
  error: string;
};

/**
 * useGpuConnect drives the "bring your GPU to Hanzo Cloud" toggle. It mirrors the
 * mining hook: it reads the manager state over Tauri IPC and exposes connect /
 * disconnect. The Go `hanzo gpu connect` CLI does the real work (register + claim
 * loop); the desktop bridges its IAM token to the CLI via HANZO_TOKEN, since the
 * renderer store and the CLI's ~/.hanzo/credentials.json are separate stores.
 */
export const useGpuConnect = () => {
  const auth = useAuth((state) => state.auth);
  const [state, setState] = useState<GpuConnectState>({
    connected: false,
    error: '',
  });

  const refresh = useCallback(async () => {
    const next = await safeInvoke<GpuConnectState>('gpu_connect_get_state');
    if (next) setState(next);
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 5000);
    return () => clearInterval(id);
  }, [refresh]);

  const connect = useCallback(async () => {
    const token = auth?.hanzo_token;
    if (!token) {
      setState((prev) => ({
        ...prev,
        error: 'Sign in to your Hanzo account first.',
      }));
      return;
    }
    await safeInvoke('gpu_connect_start', { token });
    await refresh();
  }, [auth, refresh]);

  const disconnect = useCallback(async () => {
    await safeInvoke('gpu_connect_stop');
    await refresh();
  }, [refresh]);

  const toggle = useCallback(
    async (on: boolean) => {
      if (on) await connect();
      else await disconnect();
    },
    [connect, disconnect],
  );

  return {
    connected: state.connected,
    error: state.error,
    signedIn: Boolean(auth?.hanzo_token),
    connect,
    disconnect,
    toggle,
  };
};
