import { useAppRestart } from '@/src/contexts/app-shell/AppRestartProvider';
import { RestartRequiredScreen } from '@/src/features/dev';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { RemountOnWorkplace } from '@/src/navigation/RemountOnWorkplace';
import { RoutePresentationProvider } from '@/src/navigation/RoutePresentationContext';
import { ROUTE_MANIFEST, type RoutePresentation } from '@/src/navigation/routeManifest';
import { WorkplaceBoundScreen } from '@/src/navigation/WorkplaceBoundScreen';
import { Stack } from 'expo-router';
import type { ReactElement } from 'react';

/**
 * Orchestrates the main app content based on onboarding and restart state.
 */
export function AppContent() {
  const { isRestartRequired } = useAppRestart();

  if (isRestartRequired) {
    return <RestartRequiredScreen />;
  }

  return <NavigationStack />;
}

/**
 * The main stack definition for expo-router.
 */
export function NavigationStack() {
  const reduceMotion = useReducedMotion();
  const stackRoutes = ROUTE_MANIFEST.filter(
    route => route.name === '(tabs)' || (route.presentation !== 'tab' && !route.name.includes('/')),
  );

  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
      screenLayout={StackRouteLayout}
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
                  gestureEnabled: true,
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

const PRESENTATION_BY_ROUTE = new Map<string, RoutePresentation>(
  ROUTE_MANIFEST.map(route => [route.name, route.presentation]),
);

/** expo-router drops per-screen `layout`, so per-presentation wrappers go through the navigator. */
function StackRouteLayout({
  route,
  children,
}: {
  route: { name: string };
  children: ReactElement;
}) {
  const presentation = PRESENTATION_BY_ROUTE.get(route.name);
  if (presentation === 'detail') {
    return (
      <RoutePresentationProvider presentation="detail">
        <RemountOnWorkplace>{children}</RemountOnWorkplace>
      </RoutePresentationProvider>
    );
  }
  if (presentation === 'composer') {
    return (
      <RoutePresentationProvider presentation="composer">
        <WorkplaceBoundScreen>{children}</WorkplaceBoundScreen>
      </RoutePresentationProvider>
    );
  }
  return children;
}
