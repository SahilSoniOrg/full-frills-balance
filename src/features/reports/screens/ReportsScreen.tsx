import { withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { ReportsView } from '@/src/features/reports/components/ReportsView';
import { useReportsViewModel } from '@/src/features/reports/hooks/useReportsViewModel';

function ReportsScreen() {
  const vm = useReportsViewModel();
  return <ReportsView vm={vm} />;
}

export default withPrivacyScope(ReportsScreen);
