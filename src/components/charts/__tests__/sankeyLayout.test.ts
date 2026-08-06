import {
  computeSankeyLayout,
  prepareSankeyChartData,
  resolveSankeyChartHeight,
  sankeyRibbonPath,
} from '@/src/components/charts/sankeyLayout';
import { calculateSankeyDataFromSummaries } from '@/src/services/reports/sankeyCalculator';

describe('sankeyLayout', () => {
  it('lays out income, hub, and expense nodes in three columns', () => {
    const data = calculateSankeyDataFromSummaries(
      [
        { category: 'SALARY', amount: 380_000 },
        { category: 'OTHER', amount: 250_000 },
      ],
      [
        { category: 'FOOD', amount: 250_000 },
        { category: 'OTHER', amount: 380_000 },
      ],
    );

    const layout = computeSankeyLayout(data.nodes, data.links, 360, 160);
    expect(layout).not.toBeNull();

    const depths = new Set(layout!.nodes.map(node => node.depth));
    expect(depths).toEqual(new Set([0, 1, 2]));
  });

  it('returns null when there is no data', () => {
    expect(computeSankeyLayout([], [], 360, 160)).toBeNull();
  });

  it('uses a compact height for two side rows', () => {
    expect(resolveSankeyChartHeight(2)).toBeLessThanOrEqual(220);
  });

  it('builds curved ribbon paths from link geometry', () => {
    const data = calculateSankeyDataFromSummaries(
      [{ category: 'SALARY', amount: 380_000 }],
      [{ category: 'FOOD', amount: 380_000 }],
    );
    const layout = computeSankeyLayout(data.nodes, data.links, 360, 200);
    const path = sankeyRibbonPath(layout!.links[0]);
    expect(path.startsWith('M ')).toBe(true);
    expect(path).toContain('C ');
    expect(path.endsWith('Z')).toBe(true);
  });

  it('drops tiny flows from the chart data', () => {
    const data = calculateSankeyDataFromSummaries(
      [
        { category: 'SALARY', amount: 380_000 },
        { category: 'OTHER', amount: 250_000 },
        { category: 'INTEREST_INCOME', amount: 50 },
      ],
      [{ category: 'FOOD', amount: 630_050 }],
    );

    const chartData = prepareSankeyChartData(data);
    expect(chartData.nodes.some(node => node.id === 'inc_INTEREST_INCOME')).toBe(false);
    expect(data.nodes.some(node => node.id === 'inc_INTEREST_INCOME')).toBe(true);
  });
});
