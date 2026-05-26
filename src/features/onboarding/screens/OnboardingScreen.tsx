import { OnboardingView } from '@/src/features/onboarding/components/OnboardingView';
import { useOnboardingFlow } from '@/src/features/onboarding/hooks/useOnboardingFlow';

export default function OnboardingScreen() {
  const vm = useOnboardingFlow();
  return <OnboardingView {...vm} />;
}
