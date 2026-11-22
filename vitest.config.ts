import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@hanzo/desktop-brand-config': resolve(
        import.meta.dirname,
        './libs/brand-config/src/index.ts',
      ),
      '@hanzo/desktop-logo': resolve(
        import.meta.dirname,
        './libs/hanzo-logo/src/index.ts',
      ),
      '@hanzo/desktop-sdk': resolve(
        import.meta.dirname,
        './libs/desktop-sdk/src/index.ts',
      ),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: [
      'libs/**/*.test.{ts,tsx}',
      'examples/**/*.test.{ts,tsx}',
    ],
  },
});
