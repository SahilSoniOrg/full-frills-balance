import { database } from '@/src/data/database/Database';
import { accountWriteRepository } from '@/src/data/repositories/account';
import { createJournalFixture } from '@/src/testing/journalFixtures';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { AccountType, TransactionType } from '@/src/types/enums';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { firstValueFrom } from 'rxjs';

describe('TransactionRawRepository account period metrics', () => {
  const workplaceId = '00000000-0000-4000-8000-000000000001' as WorkplaceId;
  const firstDate = new Date('2026-08-22T12:00:00.000Z').getTime();
  const secondDate = new Date('2026-09-05T12:00:00.000Z').getTime();

  let childAccountId: AccountId;
  let parentAccountId: AccountId;

  beforeEach(async () => {
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });

    const parent = await accountWriteRepository.create({
      name: 'Parent',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId,
    });
    const child = await accountWriteRepository.create({
      name: 'Child',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      parentAccountId: parent.id,
      workplaceId,
    });
    const offset = await accountWriteRepository.create({
      name: 'Offset',
      accountType: AccountType.EQUITY,
      currencyCode: 'USD',
      workplaceId,
    });

    parentAccountId = parent.id;
    childAccountId = child.id;

    await createJournalFixture(
      {
        description: 'In range',
        journalDate: firstDate,
        currencyCode: 'USD',
        transactions: [
          { accountId: child.id, amount: 100, transactionType: TransactionType.DEBIT },
          { accountId: offset.id, amount: 100, transactionType: TransactionType.CREDIT },
        ],
      },
      workplaceId,
    );

    await createJournalFixture(
      {
        description: 'Outside range',
        journalDate: secondDate,
        currencyCode: 'USD',
        transactions: [
          { accountId: child.id, amount: 50, transactionType: TransactionType.DEBIT },
          { accountId: offset.id, amount: 50, transactionType: TransactionType.CREDIT },
        ],
      },
      workplaceId,
    );
  });

  it('changes totals when the date range changes for a parent subtree', async () => {
    const firstRange = await firstValueFrom(
      transactionRawRepository.observeAccountPeriodMetricsRaw(
        workplaceId,
        [parentAccountId, childAccountId],
        firstDate - 1,
        firstDate + 1,
        AccountType.ASSET,
      ),
    );
    const secondRange = await firstValueFrom(
      transactionRawRepository.observeAccountPeriodMetricsRaw(
        workplaceId,
        [parentAccountId, childAccountId],
        secondDate - 1,
        secondDate + 1,
        AccountType.ASSET,
      ),
    );

    expect(firstRange).toEqual({ totalIncrease: 100, totalDecrease: 0 });
    expect(secondRange).toEqual({ totalIncrease: 50, totalDecrease: 0 });
  });
});
