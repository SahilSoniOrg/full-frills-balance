import { mapLiabilityFlowsToPlannedOccurrences } from '@/src/features/planned-payments/mappers/plannedOccurrenceMapper';
import { FlowCategory, FlowSource } from '@/src/services/simulation/types';
import { AccountId, JournalDisplayType } from '@/src/types/domain';

describe('plannedOccurrenceMapper', () => {
  const todayStartMs = Date.UTC(2026, 6, 31); // 2026-07-31

  const accountMap = new Map([
    ['checking', { name: 'Everyday Checking', icon: 'wallet' } as any],
    ['cc-visa', { name: 'Visa Card', icon: 'creditCard' } as any],
  ]);

  it('maps liability outflows to SIMULATED_LIABILITY occurrences without synthetic_ ids', () => {
    const result = mapLiabilityFlowsToPlannedOccurrences({
      allFlows: [
        {
          kind: 'OUTFLOW',
          accountId: 'checking' as AccountId,
          amount: 120,
          dayOffset: 3,
          category: FlowCategory.DEBT,
          timeframe: 'FUTURE',
          label: 'Visa minimum',
          origin: FlowSource.LIABILITY,
          referenceId: 'cc-visa',
        },
        {
          kind: 'INFLOW',
          accountId: 'checking' as AccountId,
          amount: 2000,
          dayOffset: 15,
          category: FlowCategory.INCOME,
          timeframe: 'FUTURE',
          label: 'Salary',
          origin: FlowSource.PLANNED_PAYMENT,
          referenceId: 'salary-1',
        },
        {
          kind: 'OUTFLOW',
          accountId: 'checking' as AccountId,
          amount: 40,
          dayOffset: 1,
          category: FlowCategory.BUDGET,
          timeframe: 'FUTURE',
          label: 'Groceries',
          origin: FlowSource.BUDGET,
          referenceId: 'budget-groc',
        },
      ],
      accountMap,
      currencyCode: 'USD',
      todayStartMs,
    });

    expect(result).toHaveLength(1);
    const [item] = result;
    expect(item.origin).toBe('SIMULATED_LIABILITY');
    expect(item.id).not.toMatch(/^synthetic_/);
    expect(item.id).toBe('liability:cc-visa:3:0');
    expect(item.occurrenceDate).toBe(todayStartMs + 3 * 24 * 60 * 60 * 1000);
    expect(item.title).toBe('Visa minimum');
    expect(item.amount).toBe(120);
    expect(item.currencyCode).toBe('USD');
    expect(item.displayType).toBe(JournalDisplayType.EXPENSE);
    expect(item.referenceId).toBe('cc-visa');
    expect(item.payFromAccountId).toBe('checking');
    expect(item.liabilityAccountId).toBe('cc-visa');
    expect(item.accounts).toEqual([
      {
        id: 'checking',
        name: 'Everyday Checking',
        accountType: 'ASSET',
        role: 'SOURCE',
        icon: 'wallet',
      },
      {
        id: 'cc-visa',
        name: 'Visa Card',
        accountType: 'LIABILITY',
        role: 'DESTINATION',
        icon: 'creditCard',
      },
    ]);
  });

  it('falls back to label and defaults when accounts are missing', () => {
    const result = mapLiabilityFlowsToPlannedOccurrences({
      allFlows: [
        {
          kind: 'OUTFLOW',
          accountId: 'unknown-pay' as AccountId,
          amount: 50,
          dayOffset: 0,
          category: FlowCategory.DEBT,
          timeframe: 'FUTURE',
          label: 'Mystery CC',
          origin: FlowSource.LIABILITY,
          referenceId: 'unknown-cc',
        },
      ],
      accountMap: new Map(),
      currencyCode: '',
      todayStartMs,
    });

    expect(result).toHaveLength(1);
    expect(result[0].currencyCode).toBe('INR');
    expect(result[0].accounts[0].name).toBe('Checking');
    expect(result[0].accounts[0].icon).toBe('wallet');
    expect(result[0].accounts[1].name).toBe('Mystery CC');
    expect(result[0].accounts[1].icon).toBe('creditCard');
  });
});
