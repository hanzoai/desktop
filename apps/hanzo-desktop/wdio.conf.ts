// Real Tauri end-to-end harness — drives the BUILT native app over WebDriver.
//
// This is the canonical Tauri 2.x E2E setup: `tauri-driver` (a thin WebDriver
// proxy) launches the real `hanzo-desktop` binary and bridges to the platform
// webview driver. On Linux that driver is `WebKitWebDriver` (apt package
// `webkit2gtk-driver`); macOS has no equivalent driver, so this suite is
// Linux/Windows only (see e2e/README.md).
//
// Contrast with e2e-tests/ (Playwright): those hit the Vite dev frontend in
// Chromium with NO Tauri IPC — pure frontend smoke. THIS suite is the real
// thing: native window, real `window.__TAURI_INTERNALS__`, real commands.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Options } from '@wdio/types';

// The repo is ESM ("type": "module"), so this config is loaded as ESM — derive
// __dirname from import.meta.url instead of the CJS global.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// WDIO v9 auto-compiles this config + the specs with ts-node when present; point
// ts-node at the e2e tsconfig (node + DOM + wdio globals, transpile-only).
process.env.TS_NODE_PROJECT = path.resolve(__dirname, 'tsconfig.e2e.json');
process.env.TS_NODE_TRANSPILE_ONLY = 'true';

// The built debug binary tauri-driver launches. `cargo build` /
// `tauri build --debug` (run from src-tauri / the app) produce it here. The
// binary name is the Cargo package name (`hanzo-desktop`).
const APP_BINARY = path.resolve(
  __dirname,
  'src-tauri',
  'target',
  'debug',
  process.platform === 'win32' ? 'hanzo-desktop.exe' : 'hanzo-desktop',
);

// `tauri-driver` resolved from PATH (cargo install tauri-driver) unless the
// caller overrides it. It speaks WebDriver on `tauriDriverPort` and spawns the
// native webview driver on `nativePort`.
const TAURI_DRIVER = process.env.TAURI_DRIVER_PATH ?? 'tauri-driver';

// tauri-driver resolves the native driver itself only by absolute path, so
// resolve the bare name on PATH up-front (env may not carry the same PATH into
// the spawned proxy).
function resolveOnPath(bin: string): string {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [bin], {
    encoding: 'utf8',
  });
  const found = r.stdout?.split(/\r?\n/).find((l) => l.trim().length > 0);
  return found?.trim() ?? bin;
}
const NATIVE_DRIVER =
  process.env.TAURI_WEBDRIVER_PATH ??
  resolveOnPath(process.platform === 'win32' ? 'msedgedriver' : 'WebKitWebDriver');

const TAURI_DRIVER_PORT = Number(process.env.TAURI_DRIVER_PORT ?? 4444);
const NATIVE_DRIVER_PORT = Number(process.env.TAURI_NATIVE_PORT ?? 4445);

let tauriDriver: ChildProcess | undefined;

export const config: WebdriverIO.Config = {
  runner: 'local',

  // tauri-driver is the WebDriver host; we manage its lifecycle in the hooks
  // below rather than as a managed service (Tauri ships no wdio service).
  hostname: '127.0.0.1',
  port: TAURI_DRIVER_PORT,
  path: '/',

  specs: [path.resolve(__dirname, 'e2e', '**', '*.e2e.ts')],
  maxInstances: 1, // one native window at a time

  capabilities: [
    {
      // NO `browserName`: tauri-driver keys solely on `tauri:options` and
      // would otherwise forward an unknown browserName to WebKitWebDriver
      // ("Failed to match capabilities"). `maxInstances: 1` — one app at a time.
      maxInstances: 1,
      'tauri:options': {
        application: APP_BINARY,
      },
    } as WebdriverIO.Capabilities,
  ],

  logLevel: (process.env.WDIO_LOG_LEVEL as Options.Testrunner['logLevel']) ?? 'warn',
  bail: 0,
  waitforTimeout: 15000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,

  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: {
    ui: 'bdd',
    timeout: 120000, // a cold native launch + first paint is slow
  },

  // --- tauri-driver lifecycle ------------------------------------------------
  onPrepare: () => {
    if (!existsSync(APP_BINARY)) {
      throw new Error(
        `Tauri debug binary not found at ${APP_BINARY}.\n` +
          `Build it first:  (cd apps/hanzo-desktop && pnpm tauri build --debug)\n` +
          `or:              cargo build --manifest-path apps/hanzo-desktop/src-tauri/Cargo.toml`,
      );
    }
    // Fail fast with an actionable message when the native driver is absent
    // (the most common Linux gap) rather than letting tauri-driver hang.
    const probe = spawnSync(NATIVE_DRIVER, ['--version'], { stdio: 'ignore' });
    if (probe.error) {
      throw new Error(
        `Native WebDriver '${NATIVE_DRIVER}' not found on PATH.\n` +
          `On Linux install it with:  sudo apt-get install -y webkit2gtk-driver\n` +
          `(provides WebKitWebDriver). See apps/hanzo-desktop/e2e/README.md.`,
      );
    }
  },

  beforeSession: () =>
    new Promise<void>((resolve, reject) => {
      // Free the proxy + native ports in case a previous run leaked a driver
      // (a failed session can leave tauri-driver's WebKitWebDriver child bound).
      killByPort(TAURI_DRIVER_PORT);
      killByPort(NATIVE_DRIVER_PORT);

      // `detached` so we can signal the whole process group on cleanup —
      // tauri-driver spawns the native driver as a child that must die too.
      tauriDriver = spawn(
        TAURI_DRIVER,
        [
          '--port',
          String(TAURI_DRIVER_PORT),
          '--native-port',
          String(NATIVE_DRIVER_PORT),
          '--native-driver',
          NATIVE_DRIVER,
        ],
        { stdio: [null, 'pipe', 'pipe'], detached: true },
      );
      tauriDriver.on('error', (error) => reject(error));
      tauriDriver.stderr?.on('data', (d: Buffer) =>
        process.stderr.write(`[tauri-driver] ${d}`),
      );
      // Give tauri-driver a moment to bind its port before the session opens.
      setTimeout(resolve, 2000);
    }),

  afterSession: () => {
    stopTauriDriver();
  },

  // Belt-and-braces: guarantee the driver (and its native child) are gone even
  // if a session never opened, so ports don't leak between runs.
  onComplete: () => {
    stopTauriDriver();
    killByPort(TAURI_DRIVER_PORT);
    killByPort(NATIVE_DRIVER_PORT);
  },
};

function stopTauriDriver(): void {
  if (!tauriDriver?.pid) return;
  try {
    // Negative pid = kill the whole detached process group (driver + child).
    process.kill(-tauriDriver.pid, 'SIGTERM');
  } catch {
    tauriDriver.kill('SIGTERM');
  }
  tauriDriver = undefined;
}

/** Best-effort: free a TCP port held by a stale driver (Linux/macOS). */
function killByPort(port: number): void {
  const r = spawnSync('sh', ['-c', `lsof -ti tcp:${port} 2>/dev/null || true`], {
    encoding: 'utf8',
  });
  for (const pid of (r.stdout ?? '').split(/\s+/).filter(Boolean)) {
    try {
      process.kill(Number(pid), 'SIGTERM');
    } catch {
      /* already gone */
    }
  }
}
