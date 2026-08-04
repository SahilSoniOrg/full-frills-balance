import { CommitmentsView } from '@/src/features/commitments/components/CommitmentsView';
import { useCommitmentsViewModel } from '@/src/features/commitments/hooks/useCommitmentsViewModel';
import { withPrivacyScope } from '@/src/contexts/PrivacyScope';

function CommitmentsScreen() {
  const vm = useCommitmentsViewModel();
  return <CommitmentsView {...vm} />;
}

export default withPrivacyScope(CommitmentsScreen);
