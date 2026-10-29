import type { DataPoint } from './chartMath';

export function buildLineChartAccessibilitySummary({
  chartName,
  data,
  formatValue,
  formatDate,
  additionalSeries = [],
}: {
  chartName: string;
  data: readonly DataPoint[];
  formatValue: (value: number) => string;
  formatDate: (timestamp: number) => string;
  additionalSeries?: readonly string[];
}): string {
  const points = data
    .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y))
    .slice()
    .sort((left, right) => left.x - right.x);
  const seriesNote =
    additionalSeries.length > 0 ? ` Also shown: ${additionalSeries.join(', ')}.` : '';

  if (points.length === 0) return `${chartName}. No data available.`;

  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (points.length === 1) {
    return `${chartName}. ${formatValue(first.y)} on ${formatDate(first.x)}.${seriesNote}`;
  }

  const low = points.reduce((lowest, point) => (point.y < lowest.y ? point : lowest));
  return `${chartName}. Starts at ${formatValue(first.y)} on ${formatDate(first.x)}, reaches a low of ${formatValue(low.y)} on ${formatDate(low.x)}, and ends at ${formatValue(last.y)} on ${formatDate(last.x)}.${seriesNote}`;
}
