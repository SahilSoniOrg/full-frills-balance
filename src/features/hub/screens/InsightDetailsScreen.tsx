import { privacyNavChrome } from '@/src/components/layout/privacyNavChrome';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { AppConfig } from '@/src/constants';
import { InsightDetailsView } from '@/src/features/hub/components/InsightDetailsView';
import { useInsightDetailsViewModel } from '@/src/features/hub/hooks/useInsightDetailsViewModel';
import type { InsightDetailsRouteParams } from '@/src/features/hub/helpers/insightDetailsPresentation';
import { withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

function InsightDetailsScreen() {
  const params = useLocalSearchParams<InsightDetailsRouteParams>();
  const vm = useInsightDetailsViewModel(params);

  const chrome = useMemo<ScreenNavChrome>(
    () => privacyNavChrome(AppConfig.strings.dashboard.insightDetails.title),
    [],
  );

  return <InsightDetailsView {...vm} chrome={chrome} />;
}

export default withPrivacyScope(InsightDetailsScreen);
