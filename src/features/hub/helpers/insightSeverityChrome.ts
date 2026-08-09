import type { Theme } from '@/src/constants/design-tokens';
import { Opacity, withOpacity } from '@/src/constants';
import { resolveThemeColor } from '@/src/design-system/utils';

export type InsightSeverity = 'high' | 'medium' | 'low';

export type InsightSeverityLabels = {
  high: string;
  medium: string;
  low: string;
};

function normalizeInsightSeverity(severity: string | undefined): InsightSeverity {
  if (severity === 'high' || severity === 'medium' || severity === 'low') {
    return severity;
  }
  return 'low';
}

/**
 * Shared severity → color + label chrome for hub cards and insight details.
 * Pass the string namespace appropriate to each surface.
 */
export function resolveInsightSeverityPresentation(
  severity: string | undefined,
  theme: Theme,
  labels: InsightSeverityLabels,
) {
  const resolved = normalizeInsightSeverity(severity);
  const baseColor =
    resolved === 'high' ? theme.error : resolved === 'medium' ? theme.warning : theme.primary;
  const color = resolveThemeColor(theme, baseColor) as string;

  return {
    color,
    chipBg: withOpacity(color, Opacity.hover),
    label: labels[resolved],
  };
}
