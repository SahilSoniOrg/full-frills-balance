import { privacyNavChrome } from '@/src/components/layout/privacyNavChrome';
import { AppConfig } from '@/src/constants';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { ReportsView } from '@/src/features/reports/components/ReportsView';
import { useReportsViewModel } from '@/src/features/reports/hooks/useReportsViewModel';
import { withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { useMemo } from 'react';

function ReportsScreen() {
  const vm = useReportsViewModel();

  const chrome = useMemo<ScreenNavChrome>(
    () => privacyNavChrome(AppConfig.strings.reports.title),
    [],
  );

  return <ReportsView vm={vm} chrome={chrome} />;
}

export default withPrivacyScope(ReportsScreen);
