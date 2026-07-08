// hanzo-desktop — converged onto the shared @hanzo/ai SDK (same surface as
// zoo/lux). The Tauri backend exposes the brand-agnostic node_* commands the
// SDK invokes. Brand is passed explicitly; the SDK bundles no brands.
import AI from '@hanzo/ai/desktop';
import { createRoot } from 'react-dom/client';

import { brandConfig } from './brand.config';

import '@hanzo/ai/ai.css';

createRoot(document.querySelector('#root') as HTMLElement).render(
  <AI
    {...brandConfig}
    features={{ chat: true, tools: true, agents: true }}
  />,
);
