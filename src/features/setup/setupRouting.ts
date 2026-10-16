const FIRST_RUN_JOURNEY = 'first_run';

export const ENCRYPTED_BACKUP_ROUTE = '/encrypted-backup';

export const SETUP_GATE_ROUTES = new Set([
  '/onboarding',
  '/import-selection',
  '/privacy-notice',
  ENCRYPTED_BACKUP_ROUTE,
]);

const FIRST_RUN_ALLOWED_PATHS = new Set(['/onboarding', '/privacy-notice', ENCRYPTED_BACKUP_ROUTE]);

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
    return FIRST_RUN_ALLOWED_PATHS.has(pathname);
  }
  return SETUP_GATE_ROUTES.has(pathname);
}

export function shouldRedirectSetupToEntry(journeyId: string, pathname: string): boolean {
  if (pathname === '/privacy-notice') return false;
  if (journeyId === FIRST_RUN_JOURNEY) return !FIRST_RUN_ALLOWED_PATHS.has(pathname);
  return !SETUP_GATE_ROUTES.has(pathname);
}
