import { readE2eLaunchConfig } from '@/src/testing/e2eLaunchArgs';

/** Emits numeric-only account lifecycle markers in an authenticated E2E build. */
export function logAccountPerformanceMarker(
  event: string,
  values: Record<string, number | string> = {},
): void {
  if (!readE2eLaunchConfig()) return;

  const suffix = Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join(' ');
  console.info(`[FFB_PERF] event=${event}${suffix ? ` ${suffix}` : ''}`);
}
