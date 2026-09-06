import { useState } from 'react';
import { getBrand } from '@hanzo/desktop-brand-config';
import { Theme, YStack } from '@hanzo/gui';

import { Shell } from './Shell';
import { type ThemeMode } from './theme';
import { Welcome } from './Welcome';

// Root of the converged Tamagui desktop UI. Owns the theme mode (dark-first,
// light supported) and the top-level surface: onboarding → shell. The GuiProvider
// lives in main.tsx; this component nests a <Theme> so the toggle re-themes the
// whole tree at runtime without next-theme (Vite/Tauri, no SSR).
export function HanzoApp() {
  const [mode, setMode] = useState<ThemeMode>('dark');
  const [onboarded, setOnboarded] = useState(false);
  // Brand comes from THE table (VITE_BRAND -> hostname -> hanzo). There is no
  // app-local brand literal left to drift from it.
  const { productName } = getBrand();

  return (
    <Theme name={mode}>
      <YStack flex={1} height="100%" bg="$background">
        {onboarded ? (
          <Shell productName={productName} mode={mode} onSetTheme={setMode} />
        ) : (
          <Welcome
            productName={productName}
            onGetStarted={() => setOnboarded(true)}
          />
        )}
      </YStack>
    </Theme>
  );
}
