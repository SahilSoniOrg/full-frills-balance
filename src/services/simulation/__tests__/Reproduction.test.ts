import Account, { AccountSubtype, AccountType } from '@/src/data/models/Account';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { cashFlowSimulationService } from '@/src/services/simulation/CashFlowSimulationService';
import dayjs from 'dayjs';

jest.mock('@/src/data/repositories/TransactionRawRepository');
jest.mock('@/src/data/repositories/TransactionRepository');
jest.mock('@/src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Safe to Spend Reproduction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-01T00:00:00.000Z'));

    (transactionRepository.findByJournals as jest.Mock).mockResolvedValue([]);
    (transactionRawRepository.getLatestBalancesRaw as jest.Mock).mockResolvedValue(new Map());
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('demonstrates that internal transfers to liabilities are not deducted from Safe to Spend', async () => {
    const creditCard = {
      id: 'cc-1',
      name: 'Credit Card',
      accountType: AccountType.LIABILITY,
      accountSubtype: AccountSubtype.CREDIT_CARD,
      metadataRecords: {
        fetch: jest.fn().mockResolvedValue([{ statementDay: 1, dueDay: 15 }]),
      },
    } as unknown as Account;

    const plannedPayment = {
      id: 'pp-1',
      name: 'CC Payment',
      fromAccountId: 'checking-1',
      toAccountId: creditCard.id,
      amount: 1000,
      nextOccurrence: dayjs().add(5, 'day').valueOf(),
      intervalType: 'MONTHLY',
      intervalN: 1,
      currencyCode: 'USD',
    };

    // Case 1: Checking has 2000, CC has 1000 balance. Planned payment 1000.
    // Safe to Spend should be 1000 (2000 - 1000 payment).
    const result1 = await cashFlowSimulationService.simulateSafeToSpend(
      new Map([['checking-1', 2000]]),
      [plannedPayment as any],
      [],
      ['checking-1'],
      [{ account: creditCard, balance: 1000 }],
      [],
      [],
      [],
      [],
      'USD',
    );

    console.log('Result 1 Safe to Spend:', result1.summary.safeToSpend);
    // If it's 2000, the bug I found is confirmed (internal transfers ignored).
    // If it's 1000, then it's working as expected.

    // Case 2: User pays 400 to the card.
    // Checking has 1600, CC has 600 balance. Planned payment still 1000.
    // Safe to Spend should be 1000 (1600 - 600 remaining payment).
    const result2 = await cashFlowSimulationService.simulateSafeToSpend(
      new Map([['checking-1', 1600]]),
      [plannedPayment as any],
      [],
      ['checking-1'],
      [{ account: creditCard, balance: 600 }],
      [],
      [],
      [],
      [],
      'USD',
    );

    console.log('Result 2 Safe to Spend:', result2.summary.safeToSpend);
  });
});
