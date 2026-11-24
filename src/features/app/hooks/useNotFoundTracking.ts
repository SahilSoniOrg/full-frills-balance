import { analytics } from '@/src/services/analytics';
import { useGlobalSearchParams, usePathname } from 'expo-router';
import React from 'react';

type NotFoundRouteParams = Record<string, string | string[] | undefined>;

function paramValueToString(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

/** Serialize the URL's query params in the order Expo Router exposes them. */
export function serializeNotFoundParams(params: NotFoundRouteParams): string {
  const pairs: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (!key) continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      const text = paramValueToString(item);
      if (text !== null) pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(text)}`);
    }
  }
  return pairs.join('&');
}

/** Emit one 404 metric per visit, including the URL and its query params. */
export function useNotFoundTracking() {
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const serializedParams = serializeNotFoundParams(params);
  const tracked = React.useRef(false);

  React.useEffect(() => {
    if (!pathname || tracked.current) return;
    tracked.current = true;
    analytics.track('not_found', {
      url: serializedParams ? `${pathname}?${serializedParams}` : pathname,
      params: serializedParams,
    });
  }, [pathname, serializedParams]);
}
