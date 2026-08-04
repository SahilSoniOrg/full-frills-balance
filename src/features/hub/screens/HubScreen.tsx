import { HubView } from '@/src/features/hub/components/HubView';
import { useHubViewModel } from '@/src/features/hub/hooks/useHubViewModel';
import { withPrivacyScope } from '@/src/contexts/PrivacyScope';

function HubScreen() {
  const vm = useHubViewModel();
  return <HubView {...vm} />;
}

export default withPrivacyScope(HubScreen);
