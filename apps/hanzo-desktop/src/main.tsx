// hanzo-desktop — converged onto the canonical Hanzo Tamagui stack: @hanzo/gui
// (runtime GuiProvider config) + @hanzo/ui v8 product components, the same target
// as hanzo.app and hanzo.chat. The old @hanzo/ai Tailwind blob (ai.css, ~4.3MB,
// stock 16px sizing + a Google-Fonts import) is gone; look & tokens are the calm,
// dark-first monochrome register from @hanzogui/config v5. Brand is a prop.
import '@hanzogui/core/reset.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { Gui } from './gui';
import { HanzoApp } from './hanzo/HanzoApp';

const root = document.querySelector('#root');
if (!root) throw new Error('root element missing');

createRoot(root as HTMLElement).render(
  <StrictMode>
    <Gui>
      <HanzoApp />
    </Gui>
  </StrictMode>,
);
