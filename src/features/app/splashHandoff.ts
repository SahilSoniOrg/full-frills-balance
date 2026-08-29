/**
 * Native splash / safe-area handoff (FUL-42).
 *
 * Manual check: cold-launch iOS and Android, light and dark. The first visible
 * frame should already sit in the final safe-area layout — no one-frame jump
 * from edge-to-edge. Repeat after backgrounding and after a theme change.
 */
import type { EdgeInsets, Metrics } from 'react-native-safe-area-context';

/** Matches `expo-splash-screen` backgroundColor in app.config.ts. */
export const NATIVE_SPLASH_BACKGROUND = '#0A0A0C';

export function hasMeasuredSafeAreaInsets(
  insets: EdgeInsets | null | undefined,
): insets is EdgeInsets {
  return insets != null;
}

/**
 * Fabric often reports a window frame with all-zero insets from getConstants()
 * before native measurement. Passing those as initialMetrics lets the tree
 * paint edge-to-edge, then jump when real insets arrive.
 */
export function resolveSafeAreaInitialMetrics(metrics: Metrics | null | undefined): Metrics | null {
  if (!metrics) {
    return null;
  }

  const { insets, frame } = metrics;
  if (frame.width <= 0 || frame.height <= 0) {
    return null;
  }

  const hasAnyInset = insets.top > 0 || insets.right > 0 || insets.bottom > 0 || insets.left > 0;
  if (!hasAnyInset) {
    return null;
  }

  return metrics;
}

export function shouldHideNativeSplash({
  isAppReady,
  isDataHydrated,
  hasCompletedOnboarding,
  hasSafeAreaInsets,
}: {
  isAppReady: boolean;
  isDataHydrated: boolean;
  hasCompletedOnboarding: boolean;
  hasSafeAreaInsets: boolean;
}): boolean {
  const isFullyReady = isAppReady && (!hasCompletedOnboarding || isDataHydrated);
  return isFullyReady && hasSafeAreaInsets;
}
