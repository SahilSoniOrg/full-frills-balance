import { withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { CategorizationReviewView } from '@/src/features/settings/components/CategorizationReviewView';
import { useTransactionCaptureViewModel } from '@/src/features/settings/hooks/useTransactionCaptureViewModel';

function CategorizationReviewScreen() {
  const capture = useTransactionCaptureViewModel({ loadReviewItems: true });

  return <CategorizationReviewView key={capture.workplaceId} capture={capture} />;
}

export default withPrivacyScope(CategorizationReviewScreen);
