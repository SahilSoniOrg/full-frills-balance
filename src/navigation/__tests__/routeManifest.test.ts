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

  it('registers People and people management routes', () => {
    expect(ROUTE_MANIFEST.find(route => route.name === 'people')).toMatchObject({
      screenType: 'people',
      flowContext: 'people_management',
      presentation: 'tab',
    });
    expect(workplaceSwitchFallback('person-details')?.name).toBe('people');
    for (const name of ['split-expense', 'settle-up'])
      expect(ROUTE_MANIFEST.find(route => route.name === name)).toMatchObject({
        presentation: 'composer',
        isModal: true,
      });
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

  it('returns account matcher management to Accounts on a workplace switch', () => {
    expect(workplaceSwitchFallback('account-matchers')?.name).toBe('accounts');
    expect(ROUTE_MANIFEST.find(route => route.name === 'account-matchers')).toMatchObject({
      presentation: 'detail',
      isModal: false,
    });
  });
});
