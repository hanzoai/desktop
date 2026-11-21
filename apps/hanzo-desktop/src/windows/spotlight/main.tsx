import './globals.css';

import { I18nProvider } from '@hanzo_network/hanzo-i18n';
import { QueryProvider } from '@hanzo_network/hanzo-node-state';
import { Toaster, TooltipProvider } from '@hanzo_network/hanzo-ui';
import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ErrorBoundary } from 'react-error-boundary';
import { BrowserRouter as Router } from 'react-router';

import { ChatProvider } from '../../components/chat/context/chat-context';
import { ToolsProvider } from '../../components/chat/context/tools-context';
import FullPageErrorFallback from '../../components/error-boundary';
import { hanzoNodeQueryClient } from '../../lib/hanzo-node-manager/hanzo-node-manager-client';
import { useHanzoNodeEventsToast } from '../../lib/hanzo-node-manager/hanzo-node-manager-hooks';
import { HanzoNodeRunningOverlay } from '../../lib/hanzo-node-overlay';
import { useSyncStorageSecondary } from '../../store/sync-utils';
import QuickAsk from './components/quick-ask';
import { QuickAskProvider } from './context/quick-ask';

const App = () => {
  useSyncStorageSecondary();
  useHanzoNodeEventsToast();

  return (
    <I18nProvider>
      <ErrorBoundary FallbackComponent={FullPageErrorFallback}>
        <QuickAskProvider>
          <ToolsProvider>
            <HanzoNodeRunningOverlay>
              <ChatProvider>
                <TooltipProvider delayDuration={0}>
                  <Router>
                    {/*<Routes>*/}
                    <QuickAsk />
                    {/*</Routes>*/}
                  </Router>
                  <Toaster />
                </TooltipProvider>
              </ChatProvider>
            </HanzoNodeRunningOverlay>
          </ToolsProvider>
        </QuickAskProvider>
      </ErrorBoundary>
    </I18nProvider>
  );
};

ReactDOM.createRoot(document.querySelector('#root') as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={hanzoNodeQueryClient}>
      <QueryProvider>
        <App />
      </QueryProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
