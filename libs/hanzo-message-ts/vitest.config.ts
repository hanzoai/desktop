/// <reference types="vitest" />
// @ts-expect-error path
import path from 'path';
import topLevelAwait from 'vite-plugin-top-level-await';
import wasm from 'vite-plugin-wasm';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  cacheDir: '../../node_modules/.vite/hanzo-message-ts',
  resolve: {
    alias: {
      './libsodium-sumo.mjs': path.resolve(
        __dirname,
        '../../node_modules/libsodium-sumo/dist/modules-sumo-esm/libsodium-sumo.mjs',
      ),
    },
  },
  plugins: [
    tsconfigPaths({ root: '../..' }),
    wasm(),
    topLevelAwait(),
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
