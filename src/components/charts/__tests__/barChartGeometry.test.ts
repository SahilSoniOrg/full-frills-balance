import { clampedBarCornerRadius, finiteChartValue } from '../barChartGeometry';

describe('barChartGeometry', () => {
  it('clamps corner radius below half of a 1px zero-value bar', () => {
    expect(clampedBarCornerRadius(12, 1, 4)).toBeLessThanOrEqual(0.45);
    expect(clampedBarCornerRadius(12, 1, 4)).toBeGreaterThanOrEqual(0);
  });

  it('keeps the requested radius when the bar is large enough', () => {
    expect(clampedBarCornerRadius(12, 40, 4)).toBe(4);
  });

  it('replaces non-finite chart values so SVG layout stays numeric', () => {
    expect(finiteChartValue(Number.NaN)).toBe(0);
    expect(finiteChartValue(Number.POSITIVE_INFINITY)).toBe(0);
    expect(finiteChartValue(25.5)).toBe(25.5);
  });
});
