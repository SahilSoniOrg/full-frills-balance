import { AppConfig } from '@/src/constants/app-config';
import dayjs from 'dayjs';
import { PlannedFlowGenerator } from '../engines/PlannedFlowGenerator';
import { SimulationContext } from '../types';
import { AccountId } from '@/src/types/domain';

describe('PlannedFlowGenerator Past Handling', () => {
  const simulationStartMs = dayjs('2026-04-12T00:00:00Z').valueOf();
  const safeToSpendDays = AppConfig.defaults.safeToSpendDays;
  const context: SimulationContext = {
    simulationStartMs,
    simulationDays: safeToSpendDays,
    simulationEndMs: simulationStartMs + safeToSpendDays * 24 * 60 * 60 * 1000,
    resultCurrency: 'USD',
    liquidAccountIds: new Set(['cash' as AccountId]),
    orderedLiquidAccountIds: ['cash' as AccountId],
    liabilityAccountIds: new Set([]),
    accountMap: new Map(),
    convert: amount => amount,
  };

  it('includes past recurring planned payments as Day 0 flows', () => {
    const pp = {
      id: 'pp-1',
      name: 'Past Rent',
      amount: 1000,
      currencyCode: 'USD',
      fromAccountId: 'cash' as AccountId,
      toAccountId: 'rent-category' as AccountId,
      nextOccurrence: dayjs(simulationStartMs).subtract(2, 'day').valueOf(),
      intervalType: 'MONTHLY',
      intervalN: 1,
    };

    const { flows } = PlannedFlowGenerator.generate(
      context,
      [pp],
      [],
      new Set(['rent-category']),
      new Map(),
    );

    // Should have one flow for the past payment (now today) and potentially nothing else if next is 1 month away
    expect(flows.some(f => f.referenceId === 'pp-1' && f.dayOffset === 0)).toBe(true);
  });

  it('includes past scheduled journals mapped to Day 0', () => {
    const journal = {
      id: 'j-1',
      journalDate: dayjs(simulationStartMs).subtract(1, 'day').valueOf(),
      description: 'Scheduled Past Payment',
    };

    const journalTxsMap = new Map([
      [
        'j-1',
        [
          {
            accountId: 'cash' as AccountId,
            amount: 500,
            transactionType: 'DEBIT',
            currencyCode: 'USD',
          },
        ],
      ],
    ]);

    const { flows } = PlannedFlowGenerator.generate(
      context,
      [],
      [journal as any],
      new Set(),
      journalTxsMap as any,
    );

    // NEW BEHAVIOR: Returns 1 flow at Day 0
    expect(flows.length).toBe(1);
    expect(flows[0].dayOffset).toBe(0);
  });
});
