import { AppConfig } from '@/src/constants/app-config';
import { calculateSankeyDataFromSummaries } from '@/src/services/reports/sankeyCalculator';

describe('calculateSankeyDataFromSummaries', () => {
  it('maps income and expense categories with human-readable labels', () => {
    const data = calculateSankeyDataFromSummaries(
      [{ category: 'SALARY', amount: 5000 }],
      [
        { category: 'FOOD', amount: 1200 },
        { category: 'HOUSING', amount: 1800 },
      ],
    );

    expect(data.summary).toEqual({
      totalIncome: 5000,
      totalExpense: 3000,
      surplus: 2000,
      deficit: 0,
    });
    expect(data.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'inc_SALARY', name: 'Salary', percentOfIncome: 100 }),
        expect.objectContaining({ id: 'exp_FOOD', name: 'Food', percentOfIncome: 24 }),
        expect.objectContaining({ id: 'exp_HOUSING', name: 'Housing', percentOfIncome: 36 }),
        expect.objectContaining({ id: 'surplus', name: AppConfig.strings.reports.sankeySurplus }),
      ]),
    );
    expect(data.links).toEqual(
      expect.arrayContaining([
        { source: 'inc_SALARY', target: 'total_income', value: 5000 },
        { source: 'total_income', target: 'exp_FOOD', value: 1200 },
        { source: 'total_income', target: 'exp_HOUSING', value: 1800 },
        { source: 'total_income', target: 'surplus', value: 2000 },
      ]),
    );
  });

  it('disambiguates shared category labels between income and spending', () => {
    const otherLabel = AppConfig.strings.reports.categoryOther;
    const data = calculateSankeyDataFromSummaries(
      [{ category: otherLabel, amount: 2500 }],
      [{ category: otherLabel, amount: 3800 }],
    );

    expect(data.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: `inc_${otherLabel}`,
          name: AppConfig.strings.reports.sankeyIncomeLabel(otherLabel),
        }),
        expect.objectContaining({
          id: `exp_${otherLabel}`,
          name: AppConfig.strings.reports.sankeyExpenseLabel(otherLabel),
        }),
      ]),
    );
  });

  it('adds a drawdown source when spending exceeds income', () => {
    const data = calculateSankeyDataFromSummaries(
      [{ category: 'SALARY', amount: 1000 }],
      [{ category: 'FOOD', amount: 1500 }],
    );

    expect(data.summary).toEqual({
      totalIncome: 1000,
      totalExpense: 1500,
      surplus: 0,
      deficit: 500,
    });
    expect(data.links).toEqual(
      expect.arrayContaining([
        { source: 'drawdown', target: 'total_income', value: 500 },
        { source: 'total_income', target: 'exp_FOOD', value: 1500 },
      ]),
    );
    expect(data.links).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ target: 'surplus' })]),
    );
    expect(data.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'drawdown', name: AppConfig.strings.reports.sankeyDrawdown }),
      ]),
    );
    expect(data.nodes).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'surplus' })]),
    );
  });
});
