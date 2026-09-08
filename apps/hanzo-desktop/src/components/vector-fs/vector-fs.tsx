import { useTranslation } from '@hanzo/desktop-i18n';
import { TooltipProvider } from '@hanzo/desktop-ui';

import { SimpleLayout } from '../../pages/layout/simple-layout';
import AllFilesTab from './components/all-files-tab';
import VectorFSDrawer from './components/vector-fs-drawer';

export default function VectorFs() {
  const { t } = useTranslation();

  return (
    <TooltipProvider delay={0}>
      <SimpleLayout title={t('vectorFs.label')}>
        <AllFilesTab />
        <VectorFSDrawer />
      </SimpleLayout>
    </TooltipProvider>
  );
}
