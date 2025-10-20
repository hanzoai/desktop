import { I18nProvider } from '@hanzo_network/hanzo-i18n';
import { QueryProvider } from '@hanzo_network/hanzo-node-state';
import { Toaster, TooltipProvider } from '@hanzo_network/hanzo-ui';
import { info } from '@tauri-apps/plugin-log';
import { useEffect } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { BrowserRouter as Router } from 'react-router';

import FullPageErrorFallback from './components/error-boundary';
import { OAuthConnect } from './components/oauth/oauth-connect';
import { useEmbeddingMigrationToast } from './lib/embedding-migration/embedding-migration-hooks';
import { useEmbeddingStartupCheck } from './lib/embedding-migration/embedding-startup-check-hooks';
import { AnalyticsProvider } from './lib/posthog-provider';
import AppRoutes from './routes';
import { useSyncStorageSecondary } from './store/sync-utils';

// Component that wraps router content and calls hooks that need router context
function RouterContent() {
  useEmbeddingStartupCheck(); // This needs router context for useNavigate()
  
  return <AppRoutes />;
}

// Component that wraps features requiring QueryClient
function AppWithQuery() {
  useEmbeddingMigrationToast(); // This doesn't need router context

  return (
    <>
      <OAuthConnect />
      <Router>
        <RouterContent />
      </Router>
      <Toaster />
    </>
  );
}

function App() {
  useEffect(() => {
    void info('initializing main');
  }, []);
  useSyncStorageSecondary();
  return (
    <TooltipProvider delayDuration={0}>
      <I18nProvider>
        <ErrorBoundary FallbackComponent={FullPageErrorFallback}>
          <AnalyticsProvider>
            <QueryProvider>
              <AppWithQuery />
            </QueryProvider>
          </AnalyticsProvider>
        </ErrorBoundary>
      </I18nProvider>
    </TooltipProvider>
  );
}

export default App;
