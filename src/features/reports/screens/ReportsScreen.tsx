import { PrivacyToggleButton } from '@/src/components/common/PrivacyToggleButton';
import { AppConfig } from '@/src/constants';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { ReportsView } from '@/src/features/reports/components/ReportsView';
import { useReportsViewModel } from '@/src/features/reports/hooks/useReportsViewModel';
import { withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { useMemo } from 'react';

function ReportsScreen() {
  const vm = useReportsViewModel();

  const chrome = useMemo<ScreenNavChrome>(
    () => ({
      screenTitle: AppConfig.strings.reports.title,
      showBack: true,
      backIcon: 'back',
      headerActions: <PrivacyToggleButton />,
    }),
    [],
  );

  return <ReportsView vm={vm} chrome={chrome} />;
}

export default withPrivacyScope(ReportsScreen);
