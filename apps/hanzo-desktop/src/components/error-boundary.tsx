import { useTranslation } from '@hanzo_network/hanzo-i18n';
import { Button } from '@hanzo_network/hanzo-ui';
import { useState } from 'react';

const FullPageErrorFallback = ({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) => {
  const { t } = useTranslation();
  const [reloadCount, setReloadCount] = useState(0);
  const MAX_RELOAD_ATTEMPTS = 3;

  const handleReload = () => {
    if (reloadCount < MAX_RELOAD_ATTEMPTS) {
      setReloadCount(reloadCount + 1);
      resetErrorBoundary();
    } else {
      // After max attempts, show a different message and don't reload
      alert(t('errorBoundary.maxReloadAttemptsReached'));
    }
  };

  return (
    <div
      className="flex h-screen flex-col items-center justify-center px-8 text-red-400"
      role="alert"
    >
      <p>{t('errorBoundary.genericError')}</p>
      <pre className="mb-4 whitespace-pre-wrap text-balance break-all text-center">
        {error.message}
      </pre>
      {reloadCount < MAX_RELOAD_ATTEMPTS ? (
        <Button
          onClick={handleReload}
          size="sm"
          variant="outline"
        >
          {t('common.refresh')}
        </Button>
      ) : (
        <div className="text-center">
          <p className="mb-2">{t('errorBoundary.maxReloadAttemptsReached')}</p>
          <p>{t('errorBoundary.contactSupport')}</p>
        </div>
      )}
    </div>
  );
};
export default FullPageErrorFallback;
