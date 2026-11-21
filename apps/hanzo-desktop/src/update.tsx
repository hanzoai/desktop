import { invoke } from '@tauri-apps/api/core';
import { platform } from '@tauri-apps/plugin-os';
import { relaunch } from '@tauri-apps/plugin-process';
import { check, type Update as Release } from '@tauri-apps/plugin-updater';
import { Button, Text } from '@hanzo/ui';
import { useCallback, useEffect, useRef, useState } from 'react';

import { isTauriAvailable } from './utils/tauri-check';

// A NEW VERSION, SAID QUIETLY, INSTALLED IN ONE PRESS.
//
// Hanzo asks the update feed (tauri.conf.json `plugins.updater`) once the window
// is up and every half hour after. When there is a newer version the bar says
// "Update available" in its own quiet voice, beside Local AI, and nothing else
// moves: no banner over the page, no dialog. One press downloads it, installs
// it and opens Hanzo again, so nobody has to find a download page or a
// terminal. The Hanzo node is stopped once the download is whole, as it was
// before the update could replace its files.

const EVERY = 30 * 60 * 1000;
/** Long enough that the update check never competes with the window opening. */
const FIRST = 15 * 1000;

export type Stage =
  | { name: 'none' }
  | { name: 'ready'; version: string }
  | { name: 'updating'; version: string; percent: number | null }
  | { name: 'failed'; version: string };

/** Whole percent of a download, or null while its size is not yet known. */
export function percent(done: number, total: number | undefined): number | null {
  return total && total > 0 ? Math.min(100, Math.round((done / total) * 100)) : null;
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
      } catch {
        // No feed, no network or an unsigned local build: the bar says nothing.
      }
    };
    const first = setTimeout(() => void look(), FIRST);
    const again = setInterval(() => void look(), EVERY);
    return () => {
      stopped = true;
      clearTimeout(first);
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
      .downloadAndInstall((event) => {
        if (event.event === 'Started') total = event.data.contentLength;
        else if (event.event === 'Progress') {
          done += event.data.chunkLength;
          setStage({ name: 'updating', version: found.version, percent: percent(done, total) });
        } else if (event.event === 'Finished') {
          setStage({ name: 'updating', version: found.version, percent: 100 });
          void invoke('hanzo_node_kill').catch(() => undefined);
        }
      })
      // Windows' installer restarts Hanzo itself; the others are opened again here.
      .then(() => (platform() === 'windows' ? undefined : relaunch()))
      .catch(() => {
        busy.current = false;
        setStage({ name: 'failed', version: found.version });
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
