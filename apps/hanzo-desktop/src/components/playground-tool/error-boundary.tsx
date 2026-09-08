import { RotateCwIcon } from 'lucide-react';
import { useTranslation } from '@hanzo/desktop-i18n';
import { Button } from '@hanzo/desktop-ui';

export function ToolErrorFallback({
  error,
  resetErrorBoundary,
}: {
  error: Error;
  resetErrorBoundary: (...args: any[]) => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="flex flex-col items-center gap-4 bg-red-900/20 px-3 py-4 text-xs text-red-400"
      role="alert"
    >
      <div className="space-y-2 text-center">
        <p>{t('playgroundTool.metadataError')}</p>
        <pre className="px-4 break-words whitespace-break-spaces">
          {error.message}
        </pre>
      </div>
      <Button
        className="bg-gray-400 text-white"
        onClick={() => resetErrorBoundary()}
        size="xs"
        type="button"
        variant="outline"
      >
        <RotateCwIcon className="size-3.5" />
        {t('common.tryAgain')}
      </Button>
    </div>
  );
}
