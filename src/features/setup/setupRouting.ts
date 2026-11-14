const CREATION_JOURNEYS = new Set(['first_run', 'add_workplace']);

export const SETUP_GATE_ROUTES = new Set(['/onboarding', '/import-selection', '/privacy-notice']);

export function setupEntryPath(): '/onboarding' {
  return '/onboarding';
}

export function isCreationJourney(value: unknown): value is 'first_run' | 'add_workplace' {
  return typeof value === 'string' && CREATION_JOURNEYS.has(value);
}

export function normalizeCreationJourney(value: unknown): 'first_run' | 'add_workplace' | undefined {
  if (value === 'first_run' || value === 'add_workplace') return value;
  if (value === 'create_workplace' || value === 'empty_device_workplace') return 'add_workplace';
  return undefined;
}

export function shouldShowCashClarity(
  journeyId: string | undefined,
  routeJourney?: string,
): boolean {
  const effectiveRoute = normalizeCreationJourney(routeJourney) ?? routeJourney;
  if (routeJourney !== undefined && !CREATION_JOURNEYS.has(effectiveRoute ?? '')) return false;
  const effectiveJourney = normalizeCreationJourney(journeyId) ?? journeyId;
  return (
    (effectiveJourney !== undefined && CREATION_JOURNEYS.has(effectiveJourney)) ||
    (effectiveRoute !== undefined && CREATION_JOURNEYS.has(effectiveRoute))
  );
}

export function shouldRenderSetupGateChildren(pathname: string, journeyId?: string): boolean {
  if (isCreationJourney(normalizeCreationJourney(journeyId) ?? journeyId)) {
    return pathname === '/onboarding' || pathname === '/privacy-notice';
  }
  return SETUP_GATE_ROUTES.has(pathname);
}

export function shouldRedirectSetupToEntry(journeyId: string, pathname: string): boolean {
  if (pathname === '/privacy-notice') return false;
  const creation = normalizeCreationJourney(journeyId) ?? journeyId;
  if (isCreationJourney(creation)) return pathname !== '/onboarding';
  return !SETUP_GATE_ROUTES.has(pathname);
}