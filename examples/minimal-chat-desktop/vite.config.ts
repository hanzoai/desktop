import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@hanzo/desktop-sdk': resolve(
        import.meta.dirname,
        '../../libs/desktop-sdk/src/index.ts',
      ),
      '@hanzo/desktop-brand-config': resolve(
        import.meta.dirname,
        '../../libs/brand-config/src/index.ts',
      ),
      '@hanzo/desktop-logo': resolve(
        import.meta.dirname,
        '../../libs/hanzo-logo/src/index.ts',
      ),
    },
  },
  server: {
    port: 1420,
    strictPort: true,
  },
});
