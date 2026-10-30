import { cpSync } from 'fs';
import { createRequire } from 'module';
import { dirname, resolve as pathResolve } from 'path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import wasm from 'vite-plugin-wasm';
import tsconfigPaths from 'vite-tsconfig-paths';
import tailwindcss from '@tailwindcss/vite';

// react-native → web resolution. @hanzo/gui + @hanzogui/lucide-icons-2 pull the
// upstream react-native / react-native-svg, whose Flow syntax crashes esbuild &
// rollup (and Vite's own optimizer manages `alias`, so a plain resolve.alias can't
// reach it). This is the canonical gui-monorepo web alias map (guiAliases({ svg,
// rnwLite }) from @hanzogui/vite-plugin) — react-native-svg → the web-safe
// @hanzogui fork, and react-native[-web][/subpaths] → @hanzogui/react-native-web-
// lite via absolute paths so every layer (scan, optimize, rollup) resolves it. No
// Tamagui compiler plugin: the runtime GuiProvider config is enough.
const req = createRequire(import.meta.url);

// @hanzo/app names its portraits by path (`/agents/<id>.png`, `/bots/<name>.png`)
// and ships them in its `assets/`. hanzo.ai copies that tree into the
// root it serves (its scripts/rooms-assets.mjs), and so does this window: into
// public/ before every serve and build, so a new portrait arrives with the next
// @hanzo/app release and the copy is never committed.
function rooms(): Plugin {
  return {
    name: 'rooms-assets',
    buildStart() {
      const from = pathResolve(dirname(req.resolve('@hanzo/app')), '..', 'assets');
      cpSync(from, pathResolve(import.meta.dirname, 'public'), { recursive: true });
    },
  };
}
const rnwlBase = dirname(
  req.resolve('@hanzogui/react-native-web-lite/package.json'),
);
// The ESM entry, NOT req.resolve('.') — require.resolve picks the "require"
// condition (dist/cjs/index.js), whose CJS shape breaks named imports
// (ActivityIndicator et al) when Vite's dev server serves it as ESM. 8.3.5
// ships `.js` (8.3.1 shipped `.mjs`), and a module is a file or a directory
// with an index, so the per-module alias names no extension and Vite finds it.
const rnwl = `${rnwlBase}/dist/esm/index.js`;
const guiAliases = [
  {
    find: 'react-native-svg',
    replacement: `${dirname(req.resolve('@hanzogui/react-native-svg/package.json'))}/dist/esm/index.js`,
  },
  {
    find: /^react-native(?:-web)?\/dist\/(?:exports|modules)\/.*\/([^/]+)$/,
    replacement: `${rnwlBase}/dist/esm/$1`,
  },
  { find: /^react-native$/, replacement: rnwl },
  {
    find: /^react-native\/(Libraries\/Utilities\/codegenNativeComponent|Libraries\/Utilities\/codegenNativeCommand)$/,
    replacement: `${rnwlBase}/$1`,
  },
  {
    find: 'react-native/package.json',
    replacement: req.resolve('@hanzogui/react-native-web-lite/package.json'),
  },
  { find: /^react-native-web$/, replacement: rnwl },
];

// https://vitejs.dev/config/
export default defineConfig(() => ({
  resolve: {
    // @hanzo/usage ships its own react devDep; force a single React instance
    // so its useUsage hook shares the app's React runtime. Dedupe the wallet
    // store's peer deps (zustand/ethers) + @luxfi/crypto to the app's copy so
    // the wallet store is one instance, not two.
    dedupe: ['react', 'react-dom', 'zustand', 'ethers', '@luxfi/crypto'],
    alias: [
      // react-native / react-native-svg → web (see guiAliases above).
      ...guiAliases,
      // libsodium-wrappers-sumo ESM entry imports ./libsodium-sumo.mjs which
      // lives in the separate libsodium-sumo package.
      {
        find: './libsodium-sumo.mjs',
        replacement: pathResolve(
          import.meta.dirname,
          '../../node_modules/libsodium-sumo/dist/modules-sumo-esm/libsodium-sumo.mjs',
        ),
      },
    ],
  },
  plugins: [rooms(), react(), tailwindcss(), tsconfigPaths({ root: '../..' }), wasm()],
  esbuild: {
    // Important for wasm plugin
    supported: {
      'top-level-await': true,
      bigint: true,
    },
  },

  define: {
    // Tamagui (@hanzo/gui) reads this to pick the web output at bundle time.
    'process.env.TAMAGUI_TARGET': JSON.stringify('web'),
  },

  optimizeDeps: {
    // Upstream react-native-web must not be pre-bundled when it is aliased to the
    // lite fork (same as @hanzogui/vite-plugin). react-native itself is aliased
    // away by guiAliases, so it never reaches the optimizer.
    exclude: ['react-native-web'],
    // CJS-only dep of the aliased react-native-web-lite ESM build; the /@fs
    // alias path bypasses the dep scanner, so without prebundling the dev
    // server ships raw CJS ("module is not defined") and the webview dies.
    // @hanzogui/normalize-css-color pulls the CJS-only @react-native/normalize-
    // color. Under pnpm neither is resolvable from the app, so naming either one
    // directly matches nothing and the dev server ships raw `module.exports` —
    // the webview dies on "module is not defined" before React mounts. Name the
    // path from a package that IS resolvable and let Vite walk it.
    include: [
      '@hanzogui/react-native-web-lite > @hanzogui/normalize-css-color > @react-native/normalize-color',
    ],
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available.
  // 1420 is the port `tauri.conf.json` `devUrl` and the Playwright smoke
  // `baseURL` both point at; serving 1421 meant `tauri:dev` and `test:smoke`
  // were aimed at a dead port. One value, three consumers.
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: [
        // Exclude output.wav from being watched
        '**/output.wav',
        // The cargo build directory is hundreds of thousands of files and no
        // part of it is a frontend input. Watching it exhausts the inotify
        // limit and `vite` dies at startup with ENOSPC the moment a debug
        // build exists — which is exactly when you want `tauri:dev`.
        '**/src-tauri/target',
        '**/src-tauri/target/**',
      ],
    },
    // headers: {
    //   'Cross-Origin-Embedder-Policy': 'require-corp',
    //   'Cross-Origin-Opener-Policy': 'cross-origin',
    // },
  },
  // 3. to make use of `TAURI_DEBUG` and other env variables
  // https://tauri.studio/v1/api/config#buildconfig.beforedevcommand
  // to access the Tauri environment variables set by the CLI with information about the current target
  envPrefix: [
    'VITE_',
    'TAURI_PLATFORM',
    'TAURI_ARCH',
    'TAURI_FAMILY',
    'TAURI_PLATFORM_VERSION',
    'TAURI_PLATFORM_TYPE',
    'TAURI_DEBUG',
  ],

  build: {
    // @hanzo/gui / react-native-web ship ES2022 syntax esbuild won't downlevel
    // to vite's legacy baseline; the Tauri webview is modern.
    target: 'es2022',
    rollupOptions: {
      input: {
        index: pathResolve(import.meta.dirname, 'index.html'),
        hanzo_node_manager: pathResolve(
          import.meta.dirname,
          'src/windows/hanzo-node-manager/index.html',
        ),
        spotlight: pathResolve(
          import.meta.dirname,
          'src/windows/spotlight/index.html',
        ),
        coordinator: pathResolve(
          import.meta.dirname,
          'src/windows/coordinator/index.html',
        ),
        hanzo_artifacts: pathResolve(
          import.meta.dirname,
          'src/windows/hanzo-artifacts/index.html',
        ),
      },
    },
  },
  test: {
    watch: false,
    setupFiles: './src/test-setup.ts',
    globals: true,
    cache: { dir: '../../node_modules/.vitest/apps/hanzo-desktop' },
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    // @hanzo/gui and the @hanzogui/* packages must go through Vite's transform
    // pipeline, not Node's CJS loader. Externalized, `resolve.alias` never
    // applies, so `react-native-svg` resolves to the UPSTREAM package whose
    // published "commonjs" build still contains TypeScript source
    // (`SvgTouchableMixin.ts`) — Node hits `Unexpected token 'typeof'` and every
    // gui-backed component test fails to even collect. Inlining routes them
    // through the same alias map the browser build uses.
    server: {
      deps: {
        inline: [/@hanzogui\//, /@hanzo\/gui/, /@hanzo\/ui/, /react-native/],
      },
    },
    coverage: {
      reportsDirectory: '../../coverage/libs/hanzo-message-ts',
      provider: 'v8',
    },
  },
  worker: {
    format: 'es' as const,
  },
}));
