import { AppConfig } from '@/src/constants/app-config';
import dayjs from 'dayjs';
import { PlannedFlowGenerator } from '../engines/PlannedFlowGenerator';
import { ProjectionComposer } from '../ProjectionComposer';
import { AccountId } from '@/src/types/domain';

describe('PlannedFlowGenerator May 5th Regression', () => {
  const simulationStartMs = dayjs('2026-04-08').startOf('day').valueOf();
  const safeToSpendDays = AppConfig.defaults.safeToSpendDays;
  const simulationEndMs = dayjs('2026-04-08').startOf('day').add(safeToSpendDays, 'day').valueOf();

  const liquidAccountIds = new Set(['bank' as AccountId]);
  const liabilityAccountIds = new Set(['cc' as AccountId]);
  const expenseAccountIds = new Set(['rent_cat' as AccountId]);

  const mockContext = {
    simulationStartMs,
    simulationDays: safeToSpendDays,
    simulationEndMs,
    resultCurrency: 'USD',
    liquidAccountIds,
    orderedLiquidAccountIds: Array.from(liquidAccountIds),
    liabilityAccountIds,
    accountMap: new Map(),
    convert: (amount: number) => amount,
  } as any;

  it('generates the May 5th occurrence if nextOccurrence is in the past (overdue gap filling)', () => {
    // Scenario: Payment was on April 5 (overdue). Next should be May 5.
    const overduePP = {
      id: 'pp_1',
      name: 'Credit Card Payment',
      amount: 1000,
      currencyCode: 'USD',
      fromAccountId: 'bank' as AccountId,
      toAccountId: 'cc' as AccountId,
      nextOccurrence: dayjs('2026-04-05').valueOf(),
      intervalType: 'MONTHLY',
      intervalN: 1,
      recurrenceDay: 5,
    };

    const { projections } = PlannedFlowGenerator.generate(
      mockContext,
      [overduePP],
      [], // No journals
      expenseAccountIds,
      new Map(),
    );

    const flows = ProjectionComposer.materializeScheduledProjections(projections, mockContext);

    // We expect TWO flows in 30-day window:
    // 1. One for the overdue April 5th payment (pulled to Day 0)
    // 2. One for the May 5th payment
    const day0Flow = flows.find(f => f.dayOffset === 0);
    const may5Flow = flows.find(f => f.dayOffset === 27); // (May 5 - April 8) = 27 days

    expect(flows.length).toBe(2);
    expect(day0Flow).toBeDefined();
    expect(may5Flow).toBeDefined();
    expect(may5Flow?.amount).toBe(1000);
    expect(may5Flow?.kind).toBe('TRANSFER');
    expect(may5Flow?.label).toBe('Credit Card Payment');
  });

  it('generates May 5th correctly if nextOccurrence is May 5th', () => {
    const futurePP = {
      id: 'pp_1',
      name: 'Credit Card Payment',
      amount: 1000,
      currencyCode: 'USD',
      nextOccurrence: dayjs('2026-05-05').valueOf(),
      intervalType: 'MONTHLY',
      intervalN: 1,
      fromAccountId: 'bank' as AccountId,
      toAccountId: 'cc' as AccountId,
    };

    const { projections } = PlannedFlowGenerator.generate(
      mockContext,
      [futurePP],
      [],
      expenseAccountIds,
      new Map(),
    );

    const flows = ProjectionComposer.materializeScheduledProjections(projections, mockContext);

    const may5Flow = flows.find(f => f.dayOffset === 27);
    expect(may5Flow).toBeDefined();
    expect(may5Flow?.amount).toBe(1000);
  });
});
