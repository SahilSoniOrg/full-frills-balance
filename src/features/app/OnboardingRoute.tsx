import { useLaunchCoordinator } from './LaunchCoordinator';
import {
  CashClarityScreen,
  SetupScreen,
  normalizeCreationRoute,
  shouldShowCashClarity,
} from '@/src/features/setup';
import { useLocalSearchParams } from 'expo-router';

export function OnboardingRoute() {
  const launch = useLaunchCoordinator();
  const { journey, mode } = useLocalSearchParams<{
    journey?: string | string[];
    mode?: string | string[];
  }>();
  const routeJourney = Array.isArray(journey) ? journey[0] : journey;
  const routeMode = Array.isArray(mode) ? mode[0] : mode;
  const normalizedJourney = normalizeCreationRoute({ journey: routeJourney, mode: routeMode });
  if (launch.kind === 'setup' && launch.unreadable) return <SetupScreen />;
  if (
    shouldShowCashClarity(
      launch.kind === 'setup' ? launch.journeyId : undefined,
      normalizedJourney ?? routeJourney,
      routeMode,
      launch.kind === 'setup' && launch.hasBlockingDraft === true,
    )
  ) {
    return <CashClarityScreen />;
  }
  return <SetupScreen />;
}
