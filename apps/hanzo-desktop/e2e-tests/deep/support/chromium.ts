// Resolve a usable headless Chromium binary from the local Playwright cache.
// We override executablePath (instead of relying on a `channel`) so CI hosts
// without Google Chrome installed still run — the ms-playwright cache ships a
// headless_shell build. Newest build wins; full chromium is the fallback.
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CACHE = join(homedir(), '.cache', 'ms-playwright');
const PINNED = join(CACHE, 'chromium_headless_shell-1228', 'chrome-linux', 'headless_shell');

function newestBuild(prefix: string, leaf: string): string | undefined {
  if (!existsSync(CACHE)) return undefined;
  const dirs = readdirSync(CACHE)
    .filter((d) => d.startsWith(prefix))
    .map((d) => ({ d, n: Number(d.slice(prefix.length)) || 0 }))
    .sort((a, b) => b.n - a.n);
  for (const { d } of dirs) {
    const p = join(CACHE, d, 'chrome-linux', leaf);
    if (existsSync(p)) return p;
  }
  return undefined;
}

export function detectChromium(): string {
  if (existsSync(PINNED)) return PINNED;
  return (
    newestBuild('chromium_headless_shell-', 'headless_shell') ??
    newestBuild('chromium-', 'chrome') ??
    PINNED
  );
}

export const launchArgs = ['--no-sandbox'];
