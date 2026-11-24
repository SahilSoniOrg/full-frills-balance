import { privacyNavChrome } from '@/src/components/layout/privacyNavChrome';
import { applySelectionChrome } from '@/src/components/layout/applySelectionChrome';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { AppConfig } from '@/src/constants';
import { InsightDetailsView } from '@/src/features/hub/components/InsightDetailsView';
import { useInsightDetailsViewModel } from '@/src/features/hub/hooks/useInsightDetailsViewModel';
import type { InsightDetailsRouteParams } from '@/src/features/hub/helpers/insightDetailsPresentation';
import { withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { AppNavigation } from '@/src/navigation/AppNavigation';
import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

function InsightDetailsScreen() {
  const params = useLocalSearchParams<InsightDetailsRouteParams>();
  const vm = useInsightDetailsViewModel(params);

  const chrome = useMemo<ScreenNavChrome>(
    () =>
      applySelectionChrome(
        privacyNavChrome(AppConfig.strings.dashboard.insightDetails.title, AppNavigation.back),
        { active: vm.isSelectionModeActive, onExit: vm.selectionChrome.exitSelectionMode },
      ),
    [vm.isSelectionModeActive, vm.selectionChrome.exitSelectionMode],
  );

  return <InsightDetailsView {...vm} chrome={chrome} />;
}

export default withPrivacyScope(InsightDetailsScreen);
