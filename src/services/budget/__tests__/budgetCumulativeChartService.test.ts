import {
  buildBudgetCumulativeChart,
  type BudgetChartTransactionInput,
} from '../budgetCumulativeChartService';
import { journalQueryRepository } from '@/src/data/repositories/journal/journalQueryRepository';
import { convertJournalLineAmount } from '@/src/services/currencyConversion';
import type Journal from '@/src/data/models/Journal';
import type { AccountId, JournalId, WorkplaceId } from '@/src/types/ids';
import { TransactionType } from '@/src/types/enums';

jest.mock('@/src/data/repositories/journal/journalQueryRepository', () => ({
  journalQueryRepository: { findByIds: jest.fn() },
}));
jest.mock('@/src/services/currencyConversion', () => ({ convertJournalLineAmount: jest.fn() }));

const workplaceId = 'workplace' as WorkplaceId;
const dining = 'dining' as AccountId;
const food = 'food' as AccountId;
const posted = 'posted' as JournalId;
const refund = 'refund' as JournalId;
const periodStart = new Date(2026, 9, 1).getTime();
const periodEnd = new Date(2026, 9, 31, 23, 59, 59).getTime();
const transaction = (
  overrides: Partial<BudgetChartTransactionInput> = {},
): BudgetChartTransactionInput => ({
  id: 'tx',
  accountId: dining,
  journalId: posted,
  amount: 10.01,
  transactionType: TransactionType.DEBIT,
  currencyCode: 'EUR',
  exchangeRate: 1.2,
  ...overrides,
});

describe('budget detail spending breakdown', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(journalQueryRepository.findByIds).mockResolvedValue([
      { id: posted, journalDate: periodStart + 1000, currencyCode: 'USD' },
      { id: refund, journalDate: periodStart + 2000, currencyCode: 'USD' },
    ] as Journal[]);
    jest
      .mocked(convertJournalLineAmount)
      .mockImplementation(async input => ({ ok: true, amount: input.amount }));
  });

  it('nets refunds, counts unique journals rather than legs, and agrees with the cumulative total', async () => {
    const chart = await buildBudgetCumulativeChart({
      workplaceId,
      periodStart,
      periodEnd,
      targetCurrency: 'USD',
      accounts: [{ id: dining }, { id: food }],
      transactions: [
        transaction(),
        transaction({ accountId: food, amount: 25 }),
        transaction({ amount: 2.02 }),
        transaction({ journalId: refund, amount: 3.03, transactionType: TransactionType.CREDIT }),
      ],
    });
    expect(chart.categories).toEqual([
      { accountId: food, spent: 25, refunds: 0, entryCount: 1, hasUnvaluedEntries: false },
      { accountId: dining, spent: 9, refunds: 3.03, entryCount: 2, hasUnvaluedEntries: false },
    ]);
    expect(chart.entryCount).toBe(2);
    expect(chart.refunds).toBe(3.03);
    expect(chart.data.at(-1)?.y).toBe(34);
    expect(convertJournalLineAmount).toHaveBeenCalledWith(
      expect.objectContaining({
        storedLineRate: 1.2,
        journalDate: periodStart + 1000,
        targetCurrency: 'USD',
      }),
    );
  });

  it('retains refund-only categories and flags unvalued lines instead of implying full totals', async () => {
    const chart = await buildBudgetCumulativeChart({
      workplaceId,
      periodStart,
      periodEnd,
      targetCurrency: 'USD',
      accounts: [{ id: dining }],
      transactions: [
        transaction({ journalId: refund, amount: 20, transactionType: TransactionType.CREDIT }),
        transaction({ accountId: food }),
      ],
    });
    expect(chart.hasUnvaluedEntries).toBe(true);
    expect(chart.unvaluedEntryCount).toBe(1);
    expect(chart.unvaluedCurrencyCounts).toEqual([{ currencyCode: 'EUR', count: 1 }]);
    expect(chart.categories).toEqual([
      { accountId: food, spent: 0, refunds: 0, entryCount: 1, hasUnvaluedEntries: true },
      { accountId: dining, spent: -20, refunds: 20, entryCount: 1, hasUnvaluedEntries: false },
    ]);
    expect(chart.data.at(-1)?.y).toBe(-20);
  });
});
