import { withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { OnboardingView } from '@/src/features/onboarding/components/OnboardingView';
import { useOnboardingFlow } from '@/src/features/onboarding/hooks/useOnboardingFlow';

function OnboardingScreen() {
  const vm = useOnboardingFlow();
  return <OnboardingView {...vm} />;
}

export default withPrivacyScope(OnboardingScreen);
