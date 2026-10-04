import { ROUTE_MANIFEST, routeManifestEntry } from '@/src/navigation/routeManifest';

describe('route manifest', () => {
  it('contains every registered route exactly once', () => {
    const names = ROUTE_MANIFEST.map(route => route.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.map(name => routeManifestEntry(name).name).sort()).toEqual([...names].sort());
  });

  it('keeps Reports V1 and Reports V2 as separate opt-in routes', () => {
    expect(routeManifestEntry('reports').flowContext).toBe('financial_reporting');
    expect(routeManifestEntry('reports-v2').flowContext).toBe('financial_reporting_v2');
  });

  it('marks composer flows as modal routes', () => {
    expect(routeManifestEntry('journal-entry')).toMatchObject({
      presentation: 'composer',
      isModal: true,
    });
  });
});
