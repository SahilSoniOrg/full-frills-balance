const FIRST_RUN_JOURNEY = 'first_run';

export const SETUP_GATE_ROUTES = new Set([
  '/onboarding',
  '/onboarding-v2',
  '/import-selection',
  '/privacy-notice',
]);

export function setupEntryPath(): '/onboarding' {
  return '/onboarding';
}

export function shouldShowCashClarity(
  journeyId: string | undefined,
  routeJourney?: string,
): boolean {
  if (routeJourney && routeJourney !== FIRST_RUN_JOURNEY) return false;
  return journeyId === FIRST_RUN_JOURNEY || routeJourney === FIRST_RUN_JOURNEY;
}

export function shouldRenderSetupGateChildren(pathname: string, journeyId?: string): boolean {
  if (journeyId === FIRST_RUN_JOURNEY) {
    return pathname === '/onboarding' || pathname === '/privacy-notice';
  }
  return SETUP_GATE_ROUTES.has(pathname);
}

export function shouldRedirectSetupToEntry(journeyId: string, pathname: string): boolean {
  if (pathname === '/privacy-notice') return false;
  if (journeyId === FIRST_RUN_JOURNEY) return pathname !== '/onboarding';
  return !SETUP_GATE_ROUTES.has(pathname);
}

export function shouldSeedSetupDraft(journeyId: string): boolean {
  return journeyId !== FIRST_RUN_JOURNEY;
}
