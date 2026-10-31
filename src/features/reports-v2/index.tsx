import { useCallback, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { privacyNavChrome } from '@/src/components/layout/privacyNavChrome';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { AppConfig } from '@/src/constants';
import { AppNavigation } from '@/src/utils/navigation';
import { reportsV2Engine } from '@/src/services/reports-v2/reportQueryEngine';
import { observeReportInputChanges } from '@/src/services/reports-v2/reportInputChanges';
import { ReportsV2View } from './screen/ReportsV2View';

function ReportsV2Screen() {
  const { workplaceId, defaultCurrencyCode } = useWorkplace();
  const [refreshVersion, setRefreshVersion] = useState(0);
  const hasFocusedOnce = useRef(false);
  const inputChanges = useMemo(() => observeReportInputChanges(workplaceId), [workplaceId]);
  useFocusEffect(
    useCallback(() => {
      if (!hasFocusedOnce.current) {
        hasFocusedOnce.current = true;
        return;
      }
      setRefreshVersion(version => version + 1);
    }, []),
  );
  const chrome = useMemo<ScreenNavChrome>(
    () => privacyNavChrome(AppConfig.strings.reports.title, AppNavigation.back),
    [],
  );
  return (
    <ReportsV2View
      engine={reportsV2Engine}
      workplaceId={workplaceId}
      targetCurrency={defaultCurrencyCode}
      inputChanges={inputChanges}
      refreshVersion={refreshVersion}
      chrome={chrome}
    />
  );
}

export default withPrivacyScope(ReportsV2Screen);
