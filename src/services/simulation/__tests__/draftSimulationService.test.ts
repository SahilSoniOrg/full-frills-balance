import { simulateDraftScenario } from '../draftSimulationService';
import { PlannedPaymentInterval } from '@/src/types/enums';
import { asAccountId } from '@/src/types/ids';
import dayjs from 'dayjs';

describe('draft simulation currency precision', () => {
  it.each([
    ['KWD', 1.001, 3],
    ['JPY', 500, 0],
  ] as const)(
    'aggregates fractional %s budget slices at the currency boundary',
    (currency, amount, precision) => {
      const cash = asAccountId('cash');
      const budgetId = 'budget-precision';
      const start = dayjs('2026-04-01').startOf('day').valueOf();
      const result = simulateDraftScenario({
        simulationStartMs: start,
        simulationDays: 30,
        resultCurrency: currency,
        startingBalances: new Map([[cash, 10_000]]),
        liquidAccountIds: [cash],
        liabilityBalances: [],
        plannedPayments: [],
        budgets: [
          {
            id: budgetId,
            name: 'Daily reserve',
            amount,
            currencyCode: currency,
            assetAccountIds: cash,
            intervalType: PlannedPaymentInterval.MONTHLY,
            intervalN: 1,
            startDate: start,
            recurrenceDay: 1,
          },
        ],
        budgetCategoryMap: new Map([[budgetId, new Set(['food'])]]),
      });

      expect(result.budgetReserveInWindow).toBe(Number(amount.toFixed(precision)));
      expect(result.flowSummary.totalCommittedPlanned).toBe(Number(amount.toFixed(precision)));
      expect(result.safeToSpend).toBe(Number((10_000 - amount).toFixed(precision)));
      expect(result.projections.at(-1)?.globalBalance).toBe(
        Number((10_000 - amount).toFixed(precision)),
      );
      expect(
        result.projections[0]?.flows.some(
          flow => flow.amount !== Number(flow.amount.toFixed(precision)),
        ),
      ).toBe(true);
    },
  );
});
