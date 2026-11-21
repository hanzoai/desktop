import { invoke } from '@tauri-apps/api/core';
import { error as logError } from '@tauri-apps/plugin-log';
import { platform } from '@tauri-apps/plugin-os';
import { relaunch } from '@tauri-apps/plugin-process';
import { check, type Update as Release } from '@tauri-apps/plugin-updater';
import { Button, Text } from '@hanzo/ui';
import { useCallback, useEffect, useRef, useState } from 'react';

import { isTauriAvailable } from './utils/tauri-check';

// A newer version is said quietly in the bar, beside Local AI, and installed in one press:
// download, stop the model and the node, install, relaunch (Windows' installer restarts Hanzo itself).

const EVERY = 30 * 60 * 1000;

export type Stage =
  | { name: 'none' }
  | { name: 'ready'; version: string }
  | { name: 'updating'; version: string; percent: number | null }
  | { name: 'failed'; version: string };

/** Whole percent of a download, or null while its size is not yet known. */
export function percent(done: number, total: number | undefined): number | null {
  return total && total > 0 ? Math.min(100, Math.round((done / total) * 100)) : null;
}

/**
 * Calls a model download off and gives it up to 2 s to take back its partial
 * files (local_models.rs `stop_all` does the same on the other exit paths).
 * Anything still there then is removed at the next start.
 */
async function cancelDownload(): Promise<void> {
  if (!(await invoke<boolean>('local_models_cancel'))) return;
  for (let waited = 0; waited < 2000; waited += 100) {
    const status = await invoke<{ pulling: string | null } | undefined>('local_models_status');
    if (!status?.pulling) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/** What the bar says for a stage: the words, the hover line and whether a press does anything. */
export function say(stage: Stage): { text: string; hint: string; press: boolean } | null {
  switch (stage.name) {
    case 'none':
      return null;
    case 'ready':
      return {
        text: 'Update available',
        hint: `Hanzo ${stage.version} is ready. Press to update and restart.`,
        press: true,
      };
    case 'updating':
      return {
        text: stage.percent === null ? 'Updating…' : `Updating… ${stage.percent}%`,
        hint: 'Hanzo restarts when this finishes.',
        press: false,
      };
    case 'failed':
      return {
        text: 'Update didn’t finish. Try again',
        hint: `Hanzo ${stage.version} could not be installed. Press to try again.`,
        press: true,
      };
  }
}

/** The update feed's newest version, the stage it puts the bar in, and the press that installs it. */
export function useUpdate(): { stage: Stage; install: () => void } {
  const [stage, setStage] = useState<Stage>({ name: 'none' });
  const release = useRef<Release | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    if (!isTauriAvailable()) return;
    let stopped = false;
    const look = async () => {
      if (busy.current) return;
      try {
        const found = await check();
        if (stopped || busy.current) return;
        release.current = found;
        setStage(found ? { name: 'ready', version: found.version } : { name: 'none' });
      } catch (err) {
        // No feed, no network or an unsigned local build: the bar says nothing.
        // The log does, or a bad signature and a missing platform both read as
        // "no update" and a stuck version cannot be told from a current one.
        void logError(`update check failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    void look();
    const again = setInterval(() => void look(), EVERY);
    return () => {
      stopped = true;
      clearInterval(again);
    };
  }, []);

  const install = useCallback(() => {
    const found = release.current;
    if (!found || busy.current) return;
    busy.current = true;
    let total: number | undefined;
    let done = 0;
    setStage({ name: 'updating', version: found.version, percent: null });
    found
      .download((event) => {
        if (event.event === 'Started') total = event.data.contentLength;
        else if (event.event === 'Progress') {
          done += event.data.chunkLength;
          setStage({ name: 'updating', version: found.version, percent: percent(done, total) });
        } else if (event.event === 'Finished') {
          setStage({ name: 'updating', version: found.version, percent: 100 });
        }
      })
      // Stopped before install, and awaited: Windows' installer ends this
      // process with process::exit, which skips the exit hook that would stop
      // a served model and call off a download (main.rs), so the model would
      // outlive the app and a half-downloaded one would stay on the disk.
      .then(() => cancelDownload().catch(() => undefined))
      .then(() => invoke('local_models_stop').catch(() => undefined))
      .then(() => found.install())
      .then(() => (platform() === 'windows' ? undefined : relaunch()))
      .catch((err: unknown) => {
        busy.current = false;
        setStage({ name: 'failed', version: found.version });
        void logError(`update to ${found.version} failed: ${err instanceof Error ? err.message : String(err)}`);
      });
  }, []);

  return { stage, install };
}

/** The bar's update mark: nothing until there is a newer version, then one quiet line. */
export function Update() {
  const { stage, install } = useUpdate();
  const line = say(stage);
  if (!line) return null;
  return (
    <Button
      size="xs"
      variant="ghost"
      data-slot="header-update"
      data-stage={stage.name}
      aria-label={line.hint}
      title={line.hint}
      height={24}
      px="$2.5"
      rounded="$3"
      disabled={!line.press}
      onPress={install}
    >
      <Text fontSize="$1" fontWeight="500" color="$soft">
        {line.text}
      </Text>
    </Button>
  );
}
