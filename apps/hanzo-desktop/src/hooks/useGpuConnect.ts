import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '../store/auth';
import { safeInvoke } from '../utils/tauri-check';

export type GpuConnectState = {
  connected: boolean;
  error: string;
};

export type StudioState = {
  running: boolean;
  available: boolean;
  error: string;
};

/**
 * useGpuConnect drives the "Share this device's GPU with Hanzo Cloud" toggle.
 *
 * The desktop OWNS the whole render pipeline as managed children:
 *  - `hanzo-fleet-worker` (commands/gpu.rs) — the light, open Rust claim loop
 *    that registers this machine in the org fleet and claims studio.render jobs.
 *    The IAM session token is bridged to it via HANZO_TOKEN (never written to disk).
 *  - the local studio (ComfyUI) render child (commands/studio.rs) — spawned when
 *    sharing turns on so the worker has somewhere to render; stopped when it turns
 *    off. If the studio runtime is absent the machine degrades to engine.serve only.
 */
export const useGpuConnect = () => {
  const auth = useAuth((state) => state.auth);
  const [state, setState] = useState<GpuConnectState>({
    connected: false,
    error: '',
  });
  const [studio, setStudio] = useState<StudioState>({
    running: false,
    available: true,
    error: '',
  });

  const refresh = useCallback(async () => {
    const next = await safeInvoke<GpuConnectState>('gpu_connect_get_state');
    if (next) setState(next);
    const st = await safeInvoke<StudioState>('studio_get_state');
    if (st) setStudio(st);
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
    // Start the local studio render runtime first (best-effort) so the worker has
    // somewhere to render. If it is unavailable the machine still serves LLM jobs.
    const st = await safeInvoke<StudioState>('studio_start');
    if (st) setStudio(st);
    await safeInvoke('gpu_connect_start', { token });
    await refresh();
  }, [auth, refresh]);

  const disconnect = useCallback(async () => {
    await safeInvoke('gpu_connect_stop');
    await safeInvoke('studio_stop');
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
    error: state.error || studio.error,
    signedIn: Boolean(auth?.hanzo_token),
    // When sharing is on but no local render runtime was found, the machine can
    // only serve engine.serve (LLM). The UI can surface this.
    renderAvailable: studio.available,
    studioRunning: studio.running,
    connect,
    disconnect,
    toggle,
  };
};
