import { InsightDetailsView } from '@/src/features/hub/components/InsightDetailsView';
import { useInsightDetailsViewModel } from '@/src/features/hub/hooks/useInsightDetailsViewModel';
import { withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { useLocalSearchParams } from 'expo-router';

function InsightDetailsScreen() {
  const params = useLocalSearchParams<{
    id?: string;
    message?: string;
    description?: string;
    suggestion?: string;
    severity?: string;
    amount?: string;
    currencyCode?: string;
    journalIds?: string;
  }>();
  const { workplaceId, defaultCurrencyCode } = useWorkplace();
  const vm = useInsightDetailsViewModel({
    workplaceId,
    workplaceCurrency: defaultCurrencyCode,
    journalIds: params.journalIds ? params.journalIds.split(',') : [],
    baseCurrency: params.currencyCode,
  });

  return <InsightDetailsView {...vm} params={params} />;
}

export default withPrivacyScope(InsightDetailsScreen);
