import type { NavBackIcon } from '@/src/components/layout/screenChrome';
import type { RoutePresentation } from '@/src/navigation/routeManifest';
import { Icon } from '@/src/types/domainIcons';
import { createContext, useContext, type ReactNode } from 'react';

const RoutePresentationContext = createContext<RoutePresentation | null>(null);

export function RoutePresentationProvider({
  presentation,
  children,
}: {
  presentation: RoutePresentation;
  children: ReactNode;
}) {
  return (
    <RoutePresentationContext.Provider value={presentation}>
      {children}
    </RoutePresentationContext.Provider>
  );
}

/** Composers slide up and dismiss with Close; everything else is pushed and goes Back. */
export function useRouteBackIcon(): NavBackIcon {
  return useContext(RoutePresentationContext) === 'composer' ? Icon.Close : Icon.Back;
}
