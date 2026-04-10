import { AppConfig } from '@/src/constants/app-config';
import Account, { AccountSubtype, AccountType } from '@/src/data/models/Account';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import dayjs from 'dayjs';
import { cashFlowSimulationService } from '../CashFlowSimulationService';

jest.mock('@/src/data/repositories/TransactionRawRepository', () => ({
  transactionRawRepository: {
    getLatestBalancesRaw: jest.fn(),
    getAccountPeriodMetricsRaw: jest.fn().mockResolvedValue({ totalDecrease: 0, totalIncrease: 0 }),
  },
}));

describe('LiabilityPrecise', () => {
  const checkingAccount = { id: 'checking' } as Account;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should not show a bill if the statement date is in the future', async () => {
    // Current date: Apr 8
    const now = dayjs('2026-04-08');
    jest.setSystemTime(now.toDate());

    const creditCard = {
      id: 'cc',
      name: 'Credit Card',
      accountType: AccountType.LIABILITY,
      accountSubtype: AccountSubtype.CREDIT_CARD,
      currencyCode: 'INR',
      metadataRecords: {
        fetch: jest.fn().mockResolvedValue([
          {
            statementDay: 15,
            dueDay: 7,
          },
        ]),
      },
    } as unknown as Account;

    // Simulation setup
    // Today is Apr 8.
    // D1 (Due Date for cycle 1) = May 7 (Since Apr 7 is past).
    // S1 (Statement date for May 7) = Apr 15.
    // Since today is Apr 8, the May 7 bill shouldn't be 'Available' yet.

    transactionRawRepository.getLatestBalancesRaw = jest
      .fn()
      .mockResolvedValue(new Map([['cc', 1000]]));
    transactionRawRepository.getAccountPeriodMetricsRaw = jest
      .fn()
      .mockResolvedValue({ totalDecrease: 0, totalIncrease: 0 });

    const startingBalances = new Map([['checking', 10000]]);
    const liabilityBalances = [{ account: creditCard, balance: 2912 }];

    const result = await cashFlowSimulationService.simulate(
      startingBalances,
      [],
      [],
      ['checking'],
      liabilityBalances,
      [],
      [],
      [creditCard],
      'INR',
    );

    // Bill for D1 (May 7) should be 0 because Apr 15 statement hasn't happened.
    expect(result.breakdowns.liabilities.committed).toBe(0);

    // If we move the date to Apr 16 (after statement)
    jest.setSystemTime(dayjs('2026-04-16').toDate());

    const resultAfterStatement = await cashFlowSimulationService.simulate(
      startingBalances,
      [],
      [],
      ['checking'],
      liabilityBalances,
      [],
      [],
      [checkingAccount, creditCard],
      'INR',
    );

    // Now Apr 16 is after Apr 15. The bill due on May 7 is now 'available'.
    // Result should be min(2912, 1000) = 1000.
    expect(resultAfterStatement.breakdowns.liabilities.committed).toBe(1000);
  });

  it('should handle the transition when today is slightly after the due day', async () => {
    // Current date: Apr 8. Due day: 7.
    // Today (Apr 8) is BEFORE Apr 15 statement. So no bill should be available for May 7.

    const now = dayjs('2026-04-08');
    jest.setSystemTime(now.toDate());

    const creditCard = {
      id: 'cc',
      name: 'Credit Card',
      accountType: AccountType.LIABILITY,
      accountSubtype: AccountSubtype.CREDIT_CARD,
      currencyCode: 'INR',
      metadataRecords: {
        fetch: jest.fn().mockResolvedValue([
          {
            statementDay: 15,
            dueDay: 7,
          },
        ]),
      },
    } as unknown as Account;

    (transactionRawRepository.getLatestBalancesRaw as jest.Mock).mockResolvedValue(
      new Map([['cc', 5000]]),
    );

    const startingBalances = new Map([['checking', 10000]]);
    const liabilityBalances = [{ account: creditCard, balance: 2912 }];

    const result = await cashFlowSimulationService.simulate(
      startingBalances,
      [],
      [],
      ['checking'],
      liabilityBalances,
      [],
      [],
      [checkingAccount, creditCard],
      'INR',
    );

    expect(result.breakdowns.liabilities.committed).toBe(0);

    // To see the 'Unbilled spending' at D2 (June 7), we need a longer simulation window
    const originalDays = AppConfig.defaults.safeToSpendDays;
    (AppConfig.defaults as any).safeToSpendDays = 90;

    const resultLong = await cashFlowSimulationService.simulate(
      startingBalances,
      [],
      [],
      ['checking'],
      liabilityBalances,
      [],
      [],
      [checkingAccount, creditCard],
      'INR',
    );

    (AppConfig.defaults as any).safeToSpendDays = originalDays;

    const d2Offset = dayjs('2026-06-07').diff(dayjs('2026-04-08'), 'day');
    const flowsAtD2 = resultLong.projections.safeToSpendDailyBreakdown.get(d2Offset);
    const ccFlow = flowsAtD2?.find(f => f.name === 'Credit Card');
    expect(ccFlow?.context).toBe('Unbilled spending');
  });
});
