import { useMemo } from 'react';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { privacyNavChrome } from '@/src/components/layout/privacyNavChrome';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { AppConfig } from '@/src/constants';
import { AppNavigation } from '@/src/utils/navigation';
import { reportsV2Engine } from '@/src/services/reports-v2/reportQueryEngine';
import { ReportsV2View } from './screen/ReportsV2View';

function ReportsV2Screen() {
  const { workplaceId, defaultCurrencyCode } = useWorkplace();
  const chrome = useMemo<ScreenNavChrome>(
    () => privacyNavChrome(AppConfig.strings.reportsV2.title, AppNavigation.back),
    [],
  );
  return (
    <ReportsV2View
      engine={reportsV2Engine}
      workplaceId={workplaceId}
      targetCurrency={defaultCurrencyCode}
      chrome={chrome}
    />
  );
}

export default withPrivacyScope(ReportsV2Screen);
