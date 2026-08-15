import { computeLineChartGeometry, findNearestIndex, DataPoint } from '../chartMath';

describe('chartMath', () => {
  describe('findNearestIndex', () => {
    it('returns -1 for empty data', () => {
      expect(findNearestIndex([], 100)).toBe(-1);
    });

    it('returns -1 for non-finite targetX', () => {
      const data: DataPoint[] = [{ x: 10, y: 100 }];
      expect(findNearestIndex(data, NaN)).toBe(-1);
      expect(findNearestIndex(data, Infinity)).toBe(-1);
      expect(findNearestIndex(data, -Infinity)).toBe(-1);
    });

    it('returns 0 for single data point', () => {
      expect(findNearestIndex([{ x: 10, y: 100 }], 50)).toBe(0);
    });

    it('finds exact match index', () => {
      const data: DataPoint[] = [
        { x: 10, y: 1 },
        { x: 20, y: 2 },
        { x: 30, y: 3 },
      ];
      expect(findNearestIndex(data, 20)).toBe(1);
    });

    it('finds nearest index when target is between points', () => {
      const data: DataPoint[] = [
        { x: 10, y: 1 },
        { x: 20, y: 2 },
        { x: 30, y: 3 },
      ];
      expect(findNearestIndex(data, 12)).toBe(0);
      expect(findNearestIndex(data, 18)).toBe(1);
      expect(findNearestIndex(data, 28)).toBe(2);
    });

    it('handles duplicate timestamps gracefully', () => {
      const data: DataPoint[] = [
        { x: 10, y: 1 },
        { x: 20, y: 2 },
        { x: 20, y: 5 },
        { x: 30, y: 3 },
      ];
      const index = findNearestIndex(data, 20);
      expect(index === 1 || index === 2).toBe(true);
    });
  });

  describe('computeLineChartGeometry', () => {
    it('handles empty data gracefully with non-zero displayRange', () => {
      const geometry = computeLineChartGeometry({
        data: [],
        height: 200,
        plotWidth: 300,
        paddingVertical: 16,
        paddingLeft: 32,
      });

      expect(geometry.path).toBe('');
      expect(geometry.sortedData).toEqual([]);
      expect(geometry.visibleData).toEqual([]);
      expect(geometry.displayRange).toBe(1);
      expect(geometry.primaryMaxPoint).toBeUndefined();
    });

    it('handles all invalid non-finite data points', () => {
      const allInvalid: DataPoint[] = [
        { x: NaN, y: 10 },
        { x: 100, y: Infinity },
        { x: NaN, y: NaN },
      ];

      const geometry = computeLineChartGeometry({
        data: allInvalid,
        height: 200,
        plotWidth: 300,
        paddingVertical: 16,
        paddingLeft: 32,
      });

      expect(geometry.path).toBe('');
      expect(geometry.sortedData).toEqual([]);
      expect(geometry.visibleData).toEqual([]);
      expect(geometry.displayRange).toBe(1);
    });

    it('filters out non-finite points while preserving valid ones', () => {
      const corruptedData: DataPoint[] = [
        { x: NaN, y: 10 },
        { x: 100, y: Infinity },
        { x: 200, y: 50 },
        { x: 300, y: 30 },
      ];

      const geometry = computeLineChartGeometry({
        data: corruptedData,
        height: 200,
        plotWidth: 300,
        paddingVertical: 16,
        paddingLeft: 32,
      });

      expect(geometry.sortedData.map(d => d.x)).toEqual([200, 300]);
      expect(geometry.visibleData.map(d => d.x)).toEqual([200, 300]);
      expect(geometry.primaryMaxPoint).toEqual({ x: 200, y: 50 });
      expect(geometry.minX).toBe(200);
      expect(geometry.maxX).toBe(300);
    });

    it('distinguishes between full sortedData and viewport-filtered visibleData', () => {
      const data: DataPoint[] = [
        { x: 0, y: 10 },
        { x: 50, y: 20 },
        { x: 100, y: 30 },
        { x: 150, y: 40 },
      ];

      const geometry = computeLineChartGeometry({
        data,
        domainX: [50, 100],
        height: 200,
        plotWidth: 200,
        paddingVertical: 16,
        paddingLeft: 32,
      });

      // sortedData contains all 4 points
      expect(geometry.sortedData.map(d => d.x)).toEqual([0, 50, 100, 150]);
      // visibleData contains only points in [50, 100]
      expect(geometry.visibleData.map(d => d.x)).toEqual([50, 100]);
      expect(geometry.minX).toBe(50);
      expect(geometry.maxX).toBe(100);
      expect(geometry.primaryMaxPoint).toEqual({ x: 100, y: 30 });
    });

    it('handles reversed domainX cleanly', () => {
      const data: DataPoint[] = [
        { x: 10, y: 1 },
        { x: 50, y: 5 },
        { x: 100, y: 10 },
      ];

      const geometry = computeLineChartGeometry({
        data,
        domainX: [80, 20], // reversed: [80, 20] -> [20, 80]
        height: 200,
        plotWidth: 200,
        paddingVertical: 16,
        paddingLeft: 32,
      });

      expect(geometry.minX).toBe(20);
      expect(geometry.maxX).toBe(80);
      expect(geometry.visibleData.map(d => d.x)).toEqual([50]);
    });

    it('handles domainX exactly matching data boundaries', () => {
      const data: DataPoint[] = [
        { x: 100, y: 10 },
        { x: 200, y: 20 },
      ];

      const geometry = computeLineChartGeometry({
        data,
        domainX: [100, 200],
        height: 200,
        plotWidth: 200,
        paddingVertical: 16,
        paddingLeft: 32,
      });

      expect(geometry.minX).toBe(100);
      expect(geometry.maxX).toBe(200);
      expect(geometry.visibleData.length).toBe(2);
    });

    it('handles empty primary data when valid secondary data exists', () => {
      const primary: DataPoint[] = [];
      const secondary: DataPoint[] = [
        { x: 100, y: 50 },
        { x: 200, y: 80 },
      ];

      const geometry = computeLineChartGeometry({
        data: primary,
        secondaryData: secondary,
        height: 200,
        plotWidth: 200,
        paddingVertical: 16,
        paddingLeft: 32,
      });

      expect(geometry.sortedData).toEqual([]);
      expect(geometry.visibleData).toEqual([]);
      expect(geometry.path).toBe('');
      expect(geometry.secondaryPath).not.toBe('');
      expect(geometry.minX).toBe(100);
      expect(geometry.maxX).toBe(200);
    });

    it('preserves sortedData when viewport excludes all primary points', () => {
      const data: DataPoint[] = [
        { x: 10, y: 10 },
        { x: 20, y: 20 },
      ];

      const geometry = computeLineChartGeometry({
        data,
        domainX: [500, 600],
        height: 200,
        plotWidth: 200,
        paddingVertical: 16,
        paddingLeft: 32,
      });

      expect(geometry.sortedData.map(d => d.x)).toEqual([10, 20]);
      expect(geometry.visibleData).toEqual([]);
      expect(geometry.path).toBe('');
      expect(geometry.displayRange).toBe(1);
    });

    it('handles viewport with only secondary data points visible', () => {
      const primary: DataPoint[] = [{ x: 10, y: 100 }];
      const secondary: DataPoint[] = [{ x: 500, y: 50 }];

      const geometry = computeLineChartGeometry({
        data: primary,
        secondaryData: secondary,
        domainX: [400, 600],
        height: 200,
        plotWidth: 200,
        paddingVertical: 16,
        paddingLeft: 32,
      });

      expect(geometry.sortedData.map(d => d.x)).toEqual([10]);
      expect(geometry.visibleData).toEqual([]);
      expect(geometry.primaryMaxPoint).toBeUndefined();
      expect(geometry.secondaryPath).not.toBe('');
      expect(geometry.minX).toBe(400);
      expect(geometry.maxX).toBe(600);
    });

    it('handles flat y = 0 series with clean non-zero display range', () => {
      const data: DataPoint[] = [
        { x: 10, y: 0 },
        { x: 20, y: 0 },
      ];

      const geometry = computeLineChartGeometry({
        data,
        height: 200,
        plotWidth: 200,
        paddingVertical: 16,
        paddingLeft: 32,
      });

      expect(geometry.displayMinY).toBe(-1);
      expect(geometry.displayRange).toBe(2);
    });

    it('handles flat positive Y series with single 10% proportional breathing room', () => {
      const flatData: DataPoint[] = [
        { x: 100, y: 1000000 },
        { x: 200, y: 1000000 },
      ];

      const geometry = computeLineChartGeometry({
        data: flatData,
        height: 200,
        plotWidth: 300,
        paddingVertical: 16,
        paddingLeft: 32,
      });

      expect(geometry.displayMinY).toBe(900000);
      expect(geometry.displayRange).toBe(200000);
    });

    it('handles flat negative Y series with proportional breathing room', () => {
      const flatNegativeData: DataPoint[] = [
        { x: 100, y: -500 },
        { x: 200, y: -500 },
      ];

      const geometry = computeLineChartGeometry({
        data: flatNegativeData,
        height: 200,
        plotWidth: 300,
        paddingVertical: 16,
        paddingLeft: 32,
      });

      expect(geometry.displayMinY).toBe(-550);
      expect(geometry.displayRange).toBe(100);
    });

    it('closes gradient polygon cleanly to first visible point x coordinate', () => {
      const data: DataPoint[] = [
        { x: 100, y: 10 },
        { x: 200, y: 20 },
      ];

      const geometry = computeLineChartGeometry({
        data,
        domainX: [0, 200], // starts earlier than first point
        height: 200,
        plotWidth: 200,
        paddingVertical: 16,
        paddingLeft: 32,
      });

      // first point is at x = 32 + (100/200)*200 = 132
      expect(geometry.gradientPath).toContain('L 132 184 Z');
    });
  });
});
