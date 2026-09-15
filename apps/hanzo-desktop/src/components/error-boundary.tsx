import { type FallbackProps } from 'react-error-boundary';
import { useTranslation } from '@hanzo/desktop-i18n';
import { Button } from '@hanzo/desktop-ui';

const FullPageErrorFallback = ({ error }: FallbackProps) => {
  const { t } = useTranslation();
  return (
    <div
      className="flex h-screen flex-col items-center justify-center px-8 text-red-400"
      role="alert"
    >
      <p>{t('errorBoundary.genericError')}</p>
      <pre className="mb-4 text-center text-balance break-all whitespace-pre-wrap">
        {error instanceof Error ? error.message : String(error)}
      </pre>
      <Button
        onClick={() => window.location.reload()}
        size="sm"
        variant="outline"
      >
        {t('common.refresh')}
      </Button>
    </div>
  );
};
export default FullPageErrorFallback;
