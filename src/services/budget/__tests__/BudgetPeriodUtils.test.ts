import dayjs from 'dayjs';
import { BudgetPeriodUtils } from '../BudgetPeriodUtils';
import Budget from '@/src/data/models/Budget';

describe('BudgetPeriodUtils', () => {
  const mockBudget = (overrides: any) =>
    ({
      intervalType: 'MONTHLY',
      intervalN: 1,
      recurrenceDay: 1,
      createdAt: dayjs('2024-01-01').valueOf(),
      ...overrides,
    }) as Budget;

  describe('MONTHLY', () => {
    it('calculates calendar month if recurrenceDay is 1', () => {
      const budget = mockBudget({ recurrenceDay: 1 });
      const ref = dayjs('2024-04-15').valueOf();
      const period = BudgetPeriodUtils.getCurrentPeriod(budget, ref);

      expect(dayjs(period.startDate).format('YYYY-MM-DD')).toBe('2024-04-01');
      expect(dayjs(period.endDate).format('YYYY-MM-DD')).toBe('2024-04-30');
    });

    it('calculates custom cycle if recurrenceDay is 15', () => {
      const budget = mockBudget({ recurrenceDay: 15 });

      // Before 15th
      const refBefore = dayjs('2024-04-10').valueOf();
      const period1 = BudgetPeriodUtils.getCurrentPeriod(budget, refBefore);
      expect(dayjs(period1.startDate).format('YYYY-MM-DD')).toBe('2024-03-15');
      expect(dayjs(period1.endDate).format('YYYY-MM-DD')).toBe('2024-04-14');

      // After 15th
      const refAfter = dayjs('2024-04-20').valueOf();
      const period2 = BudgetPeriodUtils.getCurrentPeriod(budget, refAfter);
      expect(dayjs(period2.startDate).format('YYYY-MM-DD')).toBe('2024-04-15');
      expect(dayjs(period2.endDate).format('YYYY-MM-DD')).toBe('2024-05-14');
    });
  });

  describe('WEEKLY', () => {
    it('calculates weekly cycle starting from Monday', () => {
      // 2024-04-01 is a Monday
      const budget = mockBudget({
        intervalType: 'WEEKLY',
        startDate: dayjs('2024-04-01').valueOf(),
      });

      const ref = dayjs('2024-04-10').valueOf(); // Wednesday
      const period = BudgetPeriodUtils.getCurrentPeriod(budget, ref);

      expect(dayjs(period.startDate).format('YYYY-MM-DD')).toBe('2024-04-08');
      expect(dayjs(period.endDate).format('YYYY-MM-DD')).toBe('2024-04-14');
    });
  });

  describe('DAILY', () => {
    it('calculates a single-day cycle', () => {
      const budget = mockBudget({
        intervalType: 'DAILY',
        startDate: dayjs('2024-04-15').startOf('day').valueOf(),
      });

      const ref = dayjs('2024-04-15').hour(14).valueOf();
      const period = BudgetPeriodUtils.getCurrentPeriod(budget, ref);

      expect(dayjs(period.startDate).format('YYYY-MM-DD')).toBe('2024-04-15');
      expect(dayjs(period.endDate).format('YYYY-MM-DD')).toBe('2024-04-15');
    });

    it('uses a compact period label for daily budgets', () => {
      const today = dayjs().startOf('day');
      const budget = mockBudget({
        intervalType: 'DAILY',
        startDate: today.valueOf(),
      });

      const label = BudgetPeriodUtils.getPeriodLabel(budget, today.valueOf());
      expect(label).toBe(today.format('MMM D'));
    });
  });

  describe('YEARLY', () => {
    it('calculates yearly cycle', () => {
      const budget = mockBudget({
        intervalType: 'YEARLY',
        recurrenceMonth: 4,
        recurrenceDay: 1,
      });

      const ref = dayjs('2024-05-10').valueOf();
      const period = BudgetPeriodUtils.getCurrentPeriod(budget, ref);

      expect(dayjs(period.startDate).format('YYYY-MM-DD')).toBe('2024-04-01');
      expect(dayjs(period.endDate).format('YYYY-MM-DD')).toBe('2025-03-31');
    });
  });
});
