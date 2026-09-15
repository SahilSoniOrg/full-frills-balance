import { useLaunchCoordinator } from './LaunchCoordinator';
import OnboardingScreen from '@/src/features/onboarding';
import { SetupScreen, shouldShowCashClarity } from '@/src/features/setup';
import { useLocalSearchParams } from 'expo-router';

export function OnboardingRoute() {
  const launch = useLaunchCoordinator();
  const { journey } = useLocalSearchParams<{ journey?: string | string[] }>();
  const routeJourney = Array.isArray(journey) ? journey[0] : journey;
  if (shouldShowCashClarity(launch.kind === 'setup' ? launch.journeyId : undefined, routeJourney)) {
    return <OnboardingScreen />;
  }
  return <SetupScreen />;
}
