import { defineConfig, mergeConfig, type ConfigEnv } from 'vite';

import base from './vite.config';

export default defineConfig(async (env: ConfigEnv) =>
  mergeConfig(typeof base === 'function' ? await base(env) : base, {
    server: { port: Number(process.env.PORT ?? 1526), strictPort: true, fs: { strict: false } },
    resolve: { dedupe: ['react', 'react-dom', '@hanzo/gui', '@hanzo/ui', '@hanzo/iam', '@hanzo/build', '@hanzo/i18n', '@hanzo/ai', '@hanzo/event', '@hanzogui/core', '@hanzogui/web', '@hanzo/appearance', '@hanzogui/shell'] },
    optimizeDeps: { exclude: ['@hanzo/app'] },
    plugins: process.env.WEB === '0' ? [] : [{ name: 'web-entry', transformIndexHtml: (html: string) => html.replace('/src/main.tsx', '/src/web-main.tsx') }],
  }),
);
