import Account, { AccountSubtype, AccountType } from '@/src/data/models/Account';
import { cashFlowSimulationService } from '../CashFlowSimulationService';

import dayjs from 'dayjs';

describe('LiabilitySettlement', () => {
  it('should reduce the current bill when settledAmountsSinceStatement is provided', async () => {
    // Current date: Apr 16 (Day 15 was yesterday)
    const now = dayjs('2026-04-16');
    jest.useFakeTimers().setSystemTime(now.toDate());
    const liquidAccount = {
      id: 'checking',
      name: 'Checking',
      accountType: AccountType.ASSET,
      accountSubtype: 'CHECKING',
      currencyCode: 'INR',
    } as unknown as Account;

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

    // Mock statement balance fetching to return 1000
    const {
      transactionRawRepository,
    } = require('@/src/data/repositories/TransactionRawRepository');
    transactionRawRepository.getLatestBalancesRaw = jest
      .fn()
      .mockResolvedValue(new Map([['cc', 1000]]));

    const startingBalances = new Map([['checking', 5000]]);
    const liabilityBalances = [{ account: creditCard, balance: 1000 }];

    // Scenario 1: No pre-settled amount
    const result1 = await cashFlowSimulationService.simulateSafeToSpend(
      startingBalances,
      [],
      [],
      ['checking'],
      liabilityBalances,
      [],
      [],
      [],
      [liquidAccount, creditCard],
      'INR',
      new Map(), // Empty pre-settled
    );

    // Bill should be 1000
    const ccBill1 = result1.breakdowns.liabilities.committed;
    expect(ccBill1).toBe(1000);

    // Scenario 2: With pre-settled amount of 800
    const settledAmounts = new Map([['cc', 800]]);
    const result2 = await cashFlowSimulationService.simulateSafeToSpend(
      startingBalances,
      [],
      [],
      ['checking'],
      [{ account: creditCard, balance: 200 }], // Balance already dropped to 200 after 800 payment
      [],
      [],
      [],
      [liquidAccount, creditCard],
      'INR',
      settledAmounts,
    );

    // Bill should be min(CurrentBalance 200, Statement 1000 - PreSettled 800) = 200
    // Wait, Statement 1000 - 800 = 200. Original debt was 1000. Balance was 1000.
    // If I paid 800, balance is 200.
    // Resulting bill = 200.
    expect(result2.breakdowns.liabilities.committed).toBe(200);

    // Scenario 3: Full settlement
    const settledAmountsFull = new Map([['cc', 1000]]);
    const result3 = await cashFlowSimulationService.simulateSafeToSpend(
      startingBalances,
      [],
      [],
      ['checking'],
      [{ account: creditCard, balance: 0 }], // Fully paid
      [],
      [],
      [],
      [liquidAccount, creditCard],
      'INR',
      settledAmountsFull,
    );

    expect(result3.breakdowns.liabilities.committed).toBe(0);
  });
});
