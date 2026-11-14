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

/** Route-boundary compatibility for links emitted by the retired setup wizard. */
export function normalizeCreationRoute(params: {
  journey?: unknown;
  mode?: unknown;
}): 'first_run' | 'add_workplace' | undefined {
  if (params.mode === 'full') return 'add_workplace';
  return normalizeCreationJourney(params.journey);
}

export function shouldShowCashClarity(
  journeyId: string | undefined,
  routeJourney?: string,
  routeMode?: string,
  hasBlockingDraft = false,
): boolean {
  // A persisted blocker owns the route even when an old link carries another intent.
  if (hasBlockingDraft) return journeyId !== undefined && CREATION_JOURNEYS.has(journeyId);
  if (routeJourney !== undefined || routeMode !== undefined) {
    return normalizeCreationRoute({ journey: routeJourney, mode: routeMode }) !== undefined;
  }
  return journeyId !== undefined && CREATION_JOURNEYS.has(journeyId);
}

export function shouldRenderSetupGateChildren(pathname: string, journeyId?: string): boolean {
  if (isCreationJourney(journeyId)) {
    return pathname === '/onboarding' || pathname === '/privacy-notice';
  }
  return SETUP_GATE_ROUTES.has(pathname);
}

export function shouldRedirectSetupToEntry(journeyId: string, pathname: string): boolean {
  if (pathname === '/privacy-notice') return false;
  if (isCreationJourney(journeyId)) return pathname !== '/onboarding';
  return !SETUP_GATE_ROUTES.has(pathname);
}
