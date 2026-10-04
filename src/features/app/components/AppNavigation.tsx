import { useAppRestart } from '@/src/contexts/app-shell/AppRestartProvider';
import { RestartRequiredScreen } from '@/src/features/dev';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { ROUTE_MANIFEST } from '@/src/navigation/routeManifest';
import { Stack } from 'expo-router';

/**
 * Orchestrates the main app content based on onboarding and restart state.
 */
export function AppContent() {
  const { isRestartRequired } = useAppRestart();

  if (isRestartRequired) {
    return <RestartRequiredScreen />;
  }

  // We render the same stack, expo-router handles the path matching
  // but we can add path-gating here if needed in the future.
  return <NavigationStack />;
}

/**
 * The main stack definition for expo-router.
 */
export function NavigationStack() {
  const reduceMotion = useReducedMotion();
  const stackRoutes = ROUTE_MANIFEST.filter(
    route => route.name === '(tabs)' || (!route.name.includes('/') && route.name !== 'index'),
  );

  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      {stackRoutes.map(route => (
        <Stack.Screen
          key={route.name}
          name={route.name}
          options={{
            headerShown: false,
            ...(route.presentation === 'composer'
              ? {
                  presentation: 'card' as const,
                  animation: reduceMotion ? ('none' as const) : ('slide_from_bottom' as const),
                  gestureEnabled: !reduceMotion,
                  gestureDirection: 'vertical' as const,
                }
              : route.presentation === 'detail'
                ? {
                    animation: reduceMotion ? ('none' as const) : ('slide_from_right' as const),
                    ...(route.name === 'account-management'
                      ? { headerBackButtonMenuEnabled: false }
                      : {}),
                  }
                : {}),
          }}
        />
      ))}
    </Stack>
  );
}
