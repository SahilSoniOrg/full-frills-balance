import { Spacing } from '@/src/constants/design-tokens';

/** Chart width inside padded report shells (page padding + card padding). */
export function reportChartWidth(windowWidth: number) {
  return Math.max(0, windowWidth - (Spacing.md * 2 + Spacing.lg * 2));
}
