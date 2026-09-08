import { GuiProvider } from '@hanzo/gui';
import type { ReactNode } from 'react';

import config from '../gui.config';

/**
 * The @hanzo/gui runtime context — ONE place, every window.
 *
 * gui components read their tokens, themes and media queries off this provider;
 * without it in scope a `Dialog`/`Tooltip`/`Tabs` renders with no theme at all.
 * Each of the app's five entry points mounts its own React root, so each one
 * needs the provider — this is the single composition so `defaultTheme` and the
 * config can never drift between the main window and the node manager.
 */
export function Gui({ children }: { children: ReactNode }) {
  return (
    <GuiProvider config={config} defaultTheme="dark">
      {children}
    </GuiProvider>
  );
}
