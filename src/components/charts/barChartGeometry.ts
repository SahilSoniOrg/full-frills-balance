/** Native SVG on Android aborts when a rect corner radius exceeds half its size. */
export function clampedBarCornerRadius(
  barWidth: number,
  barHeight: number,
  requestedRadius: number,
): number {
  const maxCorner = Math.max(0, Math.min(barWidth, barHeight) / 2);
  if (!Number.isFinite(requestedRadius) || requestedRadius <= 0 || maxCorner <= 0) return 0;
  return Math.min(requestedRadius, Math.max(0, maxCorner - 0.05));
}

export function finiteChartValue(value: number): number {
  return Number.isFinite(value) ? value : 0;
}
