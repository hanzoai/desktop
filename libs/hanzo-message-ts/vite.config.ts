/// <reference types="vitest" />
// @ts-expect-error path
import path from 'path';
import dts from 'vite-plugin-dts';
import topLevelAwait from 'vite-plugin-top-level-await';
import wasm from 'vite-plugin-wasm';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  cacheDir: '../../node_modules/.vite/hanzo-message-ts',
  resolve: {
    alias: {
      // libsodium-wrappers-sumo ESM entry imports ./libsodium-sumo.mjs which
      // lives in the separate libsodium-sumo package — Vite can't resolve the
      // relative import across packages, so we alias it explicitly.
      './libsodium-sumo.mjs': path.resolve(
        __dirname,
        '../../node_modules/libsodium-sumo/dist/modules-sumo-esm/libsodium-sumo.mjs',
      ),
    },
  },
  build: {
    lib: {
      entry: {
        index: './src/index.ts',
        utils: './src/utils.ts',
        cryptography: './src/cryptography.ts',
      },
      formats: ['es'],
    },
    target: 'esnext',
    outDir: 'dist',
  },
  plugins: [
    tsconfigPaths({ root: '../..' }),
    wasm(),
    topLevelAwait(),
    dts({
      entryRoot: 'src',
      tsconfigPath: path.join(__dirname, 'tsconfig.lib.json'),
      rollupTypes: true,
      copyDtsFiles: true,
      clearPureImport: false,
    }),
  ],
  test: {
    watch: false,
    setupFiles: './scripts/setupTests.ts',
    globals: true,
    cache: { dir: '../../node_modules/.vitest/libs/hanzo-message-ts' },
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/libs/hanzo-message-ts',
      provider: 'v8',
    },
  },
  root: __dirname,
});
