import { ROUTE_MANIFEST } from '@/src/navigation/routeManifest';
export const SAFE_SCREEN_SEGMENTS = (() => {
  const segments = new Set<string>(['index', '_layout', '(_layout)']);
  for (const route of ROUTE_MANIFEST) {
    for (const part of route.name.split('/')) {
      if (part) segments.add(part);
    }
  }
  return segments;
})();
export function sanitizeScreenName(value: string): string {
  const segments = value.split('/').filter(Boolean);
  if (!segments.length) return 'other';
  const safe = segments.map(segment => {
    if (SAFE_SCREEN_SEGMENTS.has(segment)) return segment;
    if (/^\[[A-Za-z][A-Za-z0-9_]*\]$/.test(segment)) return '[id]';
    return 'other';
  });
  return safe.join('/');
}
