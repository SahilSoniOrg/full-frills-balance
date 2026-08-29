import {
  hasMeasuredSafeAreaInsets,
  resolveSafeAreaInitialMetrics,
  shouldHideNativeSplash,
} from '@/src/features/app/splashHandoff';
import type { Metrics } from 'react-native-safe-area-context';

const measuredMetrics: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

const zeroInsetMetrics: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, right: 0, bottom: 0, left: 0 },
};

describe('resolveSafeAreaInitialMetrics', () => {
  it('drops null and missing native metrics so the provider waits for measurement', () => {
    expect(resolveSafeAreaInitialMetrics(null)).toBeNull();
    expect(resolveSafeAreaInitialMetrics(undefined)).toBeNull();
  });

  it('drops a zero-size frame', () => {
    expect(
      resolveSafeAreaInitialMetrics({
        frame: { x: 0, y: 0, width: 0, height: 0 },
        insets: { top: 47, right: 0, bottom: 34, left: 0 },
      }),
    ).toBeNull();
  });

  it('drops synchronous all-zero insets so the first paint cannot be edge-to-edge', () => {
    expect(resolveSafeAreaInitialMetrics(zeroInsetMetrics)).toBeNull();
  });

  it('keeps metrics that already include a real inset', () => {
    expect(resolveSafeAreaInitialMetrics(measuredMetrics)).toEqual(measuredMetrics);
  });
});

describe('shouldHideNativeSplash', () => {
  const ready = {
    isAppReady: true,
    isDataHydrated: true,
    hasCompletedOnboarding: true,
    hasSafeAreaInsets: true,
  };

  it('keeps the splash up until the first safe-area measurement exists', () => {
    expect(shouldHideNativeSplash({ ...ready, hasSafeAreaInsets: false })).toBe(false);
  });

  it('keeps the splash up until UI assets are ready', () => {
    expect(shouldHideNativeSplash({ ...ready, isAppReady: false })).toBe(false);
  });

  it('waits for data hydration when onboarding is already complete', () => {
    expect(shouldHideNativeSplash({ ...ready, isDataHydrated: false })).toBe(false);
  });

  it('does not wait for data hydration during onboarding', () => {
    expect(
      shouldHideNativeSplash({
        ...ready,
        hasCompletedOnboarding: false,
        isDataHydrated: false,
      }),
    ).toBe(true);
  });

  it('hides only when layout insets and app readiness agree', () => {
    expect(shouldHideNativeSplash(ready)).toBe(true);
  });
});

describe('hasMeasuredSafeAreaInsets', () => {
  it('treats a published insets object as measured, including devices with no inset', () => {
    expect(hasMeasuredSafeAreaInsets(undefined)).toBe(false);
    expect(hasMeasuredSafeAreaInsets(null)).toBe(false);
    expect(hasMeasuredSafeAreaInsets({ top: 0, right: 0, bottom: 0, left: 0 })).toBe(true);
    expect(hasMeasuredSafeAreaInsets({ top: 47, right: 0, bottom: 34, left: 0 })).toBe(true);
  });
});
