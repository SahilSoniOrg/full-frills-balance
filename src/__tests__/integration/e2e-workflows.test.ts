import { journalPersistenceService } from '@/src/services/journal/JournalPersistenceService';
import { AccountType, TransactionType } from '@/src/types/enums';
import { WorkplaceId } from '@/src/types/ids';

import { accountWriteRepository } from '@/src/data/repositories/account';
import { balanceReadService } from '@/src/services/balance/balanceReadService';
import { rebuildQueueService } from '@/src/services/RebuildQueueService';
import { resetDatabase } from '@/src/testing/resetDatabase';

describe('E2E Workflows', () => {
  beforeEach(async () => {
    rebuildQueueService.stop();
    await resetDatabase();
  }, 30000);

  afterAll(() => {
    rebuildQueueService.stop();
  });

  it('persists cross-currency journals with expected balances', async () => {
    const usdCash = await accountWriteRepository.create({
      name: 'USD Cash',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: 'test-workplace' as WorkplaceId,
    });
    const eurExpense = await accountWriteRepository.create({
      name: 'EUR Expense',
      accountType: AccountType.EXPENSE,
      currencyCode: 'EUR',
      workplaceId: 'test-workplace' as WorkplaceId,
    });

    await journalPersistenceService.put(
      {
        description: 'Purchase in EUR',
        journalDate: Date.now(),
        currencyCode: 'USD',
        transactions: [
          {
            accountId: usdCash.id,
            amount: 110,
            transactionType: TransactionType.CREDIT,
          },
          {
            accountId: eurExpense.id,
            amount: 100,
            transactionType: TransactionType.DEBIT,
            exchangeRate: 1.1,
          },
        ],
      },
      'test-workplace' as WorkplaceId,
    );

    await rebuildQueueService.flush();

    const usdBalance = await balanceReadService.getAccountBalance(
      usdCash.id,
      'test-workplace' as WorkplaceId,
    );
    const eurBalance = await balanceReadService.getAccountBalance(
      eurExpense.id,
      'test-workplace' as WorkplaceId,
    );

    expect(usdBalance.balance).toBe(-110);
    expect(eurBalance.balance).toBe(100);
  }, 20000);
});
