// The main window: hanzo.ai's app (@hanzo/rooms App) under this window's host
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
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { Host } from './host';

const root = document.querySelector('#root');
if (!root) throw new Error('root element missing');

createRoot(root as HTMLElement).render(
  <StrictMode>
    <Host />
  </StrictMode>,
);
