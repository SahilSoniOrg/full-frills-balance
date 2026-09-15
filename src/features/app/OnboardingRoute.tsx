import { useLaunchCoordinator } from './LaunchCoordinator';
import OnboardingV2Screen from '@/src/features/onboarding-v2';
import { SetupScreen, shouldShowCashClarity } from '@/src/features/setup';
import { useLocalSearchParams } from 'expo-router';

export function OnboardingRoute() {
  const launch = useLaunchCoordinator();
  const { journey } = useLocalSearchParams<{ journey?: string | string[] }>();
  const routeJourney = Array.isArray(journey) ? journey[0] : journey;
  if (shouldShowCashClarity(launch.kind === 'setup' ? launch.journeyId : undefined, routeJourney)) {
    return <OnboardingV2Screen />;
  }
  return <SetupScreen />;
}
