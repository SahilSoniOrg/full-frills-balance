import { ROUTE_MANIFEST, ROUTE_MANIFEST_BY_NAME } from '@/src/navigation/routeManifest';

describe('route manifest', () => {
  it('contains every registered route exactly once', () => {
    const names = ROUTE_MANIFEST.map(route => route.name);
    expect(new Set(names).size).toBe(names.length);
    expect(Object.keys(ROUTE_MANIFEST_BY_NAME).sort()).toEqual([...names].sort());
  });

  it('keeps Reports V1 and Reports V2 as separate opt-in routes', () => {
    expect(ROUTE_MANIFEST_BY_NAME.reports.flowContext).toBe('financial_reporting');
    expect(ROUTE_MANIFEST_BY_NAME['reports-v2'].flowContext).toBe('financial_reporting_v2');
  });

  it('marks composer flows as modal routes', () => {
    expect(ROUTE_MANIFEST_BY_NAME['journal-entry']).toMatchObject({
      presentation: 'composer',
      isModal: true,
    });
  });
});
