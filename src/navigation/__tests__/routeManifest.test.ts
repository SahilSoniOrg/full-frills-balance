import { ROUTE_MANIFEST, workplaceSwitchFallback } from '@/src/navigation/routeManifest';

describe('route manifest', () => {
  it('keeps Reports V1 and Reports V2 as separate opt-in routes', () => {
    expect(ROUTE_MANIFEST.find(route => route.name === 'reports')?.flowContext).toBe(
      'financial_reporting',
    );
    expect(ROUTE_MANIFEST.find(route => route.name === 'reports-v2')?.flowContext).toBe(
      'financial_reporting_v2',
    );
  });

  it('marks composer flows as modal routes', () => {
    expect(ROUTE_MANIFEST.find(route => route.name === 'journal-entry')).toMatchObject({
      presentation: 'composer',
      isModal: true,
    });
  });

  it('resolves account-management workplace fallbacks to the matching Accounts leaf', () => {
    const fallback = workplaceSwitchFallback('account-management');
    expect(fallback?.name).toBe('accounts');
    expect(fallback?.resolveName?.({ filterMode: 'categories' })).toBe('categories');
    expect(fallback?.resolveName?.({ filterMode: 'accounts' })).toBe('accounts');
    expect(fallback?.resolveName?.({})).toBe('accounts');
  });
});
