import { InsightDetailsView } from '@/src/features/hub/components/InsightDetailsView';
import { useInsightDetailsViewModel } from '@/src/features/hub/hooks/useInsightDetailsViewModel';
import type { InsightDetailsRouteParams } from '@/src/features/hub/helpers/insightDetailsPresentation';
import { withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { useLocalSearchParams } from 'expo-router';

function InsightDetailsScreen() {
  const params = useLocalSearchParams<InsightDetailsRouteParams>();
  const vm = useInsightDetailsViewModel(params);
  return <InsightDetailsView {...vm} />;
}

export default withPrivacyScope(InsightDetailsScreen);
