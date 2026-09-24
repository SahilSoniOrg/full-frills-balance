import { journalPersistenceService } from '@/src/services/journal/JournalPersistenceService';
import { firstValueFrom, take } from 'rxjs';
import { database } from '@/src/data/database/Database';
import { accountWriteRepository } from '@/src/data/repositories/account';
import { AccountType, TransactionType } from '@/src/types/enums';
import { asAccountId, asJournalId, asWorkplaceId } from '@/src/types/ids';
import { transactionService } from '../TransactionService';

const workplaceId = asWorkplaceId('wp-1');

describe('TransactionService observable reads', () => {
  let assetAccountId: ReturnType<typeof asAccountId>;
  let equityAccountId: ReturnType<typeof asAccountId>;

  beforeEach(async () => {
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });

    const asset = await accountWriteRepository.create({
      name: 'Checking',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId,
    });
    assetAccountId = asAccountId(asset.id);

    const equity = await accountWriteRepository.create({
      name: 'Equity',
      accountType: AccountType.EQUITY,
      currencyCode: 'USD',
      workplaceId,
    });
    equityAccountId = asAccountId(equity.id);
  });

  it('joins account metadata and derives balance effects', async () => {
    const journal = await journalPersistenceService.put(
      {
        description: 'Opening balance',
        journalDate: Date.now(),
        currencyCode: 'USD',
        transactions: [
          { accountId: assetAccountId, amount: 100, transactionType: TransactionType.DEBIT },
          { accountId: equityAccountId, amount: 100, transactionType: TransactionType.CREDIT },
        ],
      },
      workplaceId,
    );

    const transactions = await firstValueFrom(
      transactionService
        .observeTransactionsWithAccountInfo(workplaceId, asJournalId(journal.id))
        .pipe(take(1)),
    );

    expect(transactions).toHaveLength(2);
    expect(transactions.find(transaction => transaction.accountId === assetAccountId)).toEqual(
      expect.objectContaining({
        accountName: 'Checking',
        accountType: AccountType.ASSET,
        balanceImpact: 'INCREASE',
        journalDescription: 'Opening balance',
        displayTitle: 'Opening balance',
      }),
    );
    expect(transactions.find(transaction => transaction.accountId === equityAccountId)).toEqual(
      expect.objectContaining({
        accountName: 'Equity',
        accountType: AccountType.EQUITY,
        balanceImpact: 'INCREASE',
      }),
    );
  });

  it('returns an empty stream when no journal is selected', async () => {
    await expect(
      firstValueFrom(
        transactionService.observeTransactionsWithAccountInfo(workplaceId, asJournalId('')),
      ),
    ).resolves.toEqual([]);
  });
});
