// The main window: hanzo.ai's app (@hanzo/app App) under this window's host
// (host.tsx). The stylesheets are the ones hanzo.ai's root layout loads, in its
// order, so the app looks the same in both; gui writes its own sheet at run time.
import '@hanzo/design/tokens/fonts.css';
import '@hanzo/design/tokens/colors.css';
import '@hanzo/design/tokens/typography.css';
import '@hanzo/design/tokens/spacing.css';
import '@hanzo/design/tokens/radius.css';
import '@hanzo/design/tokens/elevation.css';
import '@hanzo/design/tokens/motion.css';
import '@hanzo/design/tokens/z.css';
import '@hanzo/design/tokens/base.css';
import '@hanzo/ui/glass.css';
import '@hanzo/font/css';
import '@hanzo/ui/styles/motion.css';
import '@hanzo/ui/styles/document.css';
import './app.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { error as logError } from '@tauri-apps/plugin-log';

import { Host } from './host';

// A webview's console is not this window's log: without these two an early
// throw paints a black page and says nothing. Report to the app's log so a
// failed start is diagnosable from the outside.
window.addEventListener('error', (e) => {
  void logError(`window.error ${e.message} @ ${e.filename}:${e.lineno}:${e.colno}\n${e.error?.stack ?? ''}`);
});
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason as Error | undefined;
  void logError(`unhandledrejection ${r?.name}: ${r?.message}\n${r?.stack ?? String(e.reason)}`);
});

const root = document.querySelector('#root');
if (!root) throw new Error('root element missing');

createRoot(root as HTMLElement).render(
  <StrictMode>
    <Host />
  </StrictMode>,
);
