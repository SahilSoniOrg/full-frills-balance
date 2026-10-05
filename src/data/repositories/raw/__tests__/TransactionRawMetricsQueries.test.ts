import { database } from '@/src/data/database/Database';
import Transaction from '@/src/data/models/Transaction';
import { createJournalFixture } from '@/src/testing/journalFixtures';
import { transactionRawMetricsQueries } from '@/src/data/repositories/raw/TransactionRawMetricsQueries';
import { rawSqlExecutor } from '@/src/data/repositories/raw/RawSqlExecutor';
import { seedTransactionRawMetricsWorkplaceIsolation } from '@/src/testing/rawQueryWorkplaceIsolationHarness';
import { expectWorkplaceScopedRawSql } from '@/src/testing/rawSqlTestHelpers';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { AccountType, TransactionType } from '@/src/types/enums';
import { Q } from '@nozbe/watermelondb';

const WORKPLACE_ONE = 'wp-metrics-isolation-1' as WorkplaceId;
const WORKPLACE_TWO = 'wp-metrics-isolation-2' as WorkplaceId;
const DAY = new Date(2025, 0, 15, 12).getTime();

describe('TransactionRawMetricsQueries workplace isolation', () => {
  let localAccountId: AccountId;
  let foreignAccountId: AccountId;

  beforeEach(async () => {
    ({ localAccountId, foreignAccountId } = await seedTransactionRawMetricsWorkplaceIsolation(
      WORKPLACE_ONE,
      WORKPLACE_TWO,
      DAY,
    ));
  });

  it('scopes every workplace-owned SQL table for all metrics queries', async () => {
    const queryRaw = jest.spyOn(rawSqlExecutor, 'query').mockResolvedValue([]);
    const accountIds = [localAccountId, foreignAccountId];

    await transactionRawMetricsQueries.getLatestBalancesRaw(
      WORKPLACE_ONE,
      accountIds,
      Number.MAX_SAFE_INTEGER,
    );
    await transactionRawMetricsQueries.getDailyDeltasGroupedRaw(
      WORKPLACE_ONE,
      accountIds,
      DAY - 1,
      DAY + 3_000,
    );

    expect(queryRaw).toHaveBeenCalledTimes(2);
    for (const [sql, args = []] of queryRaw.mock.calls) {
      expectWorkplaceScopedRawSql(sql, args, WORKPLACE_ONE, ['t', 'a', 'j']);
    }
  });

  it('rejects malformed cross-workplace links in every ORM fallback', async () => {
    jest.spyOn(rawSqlExecutor, 'query').mockResolvedValue(null);
    const accountIds = [localAccountId, foreignAccountId];

    const [latestBalances, dailyDeltas] = await Promise.all([
      transactionRawMetricsQueries.getLatestBalancesRaw(
        WORKPLACE_ONE,
        accountIds,
        Number.MAX_SAFE_INTEGER,
      ),
      transactionRawMetricsQueries.getDailyDeltasGroupedRaw(
        WORKPLACE_ONE,
        accountIds,
        DAY - 1,
        DAY + 3_000,
      ),
    ]);

    expect(latestBalances).toEqual(
      new Map([
        [localAccountId, 10],
        [foreignAccountId, 0],
      ]),
    );
    expect(dailyDeltas).toHaveLength(1);
    expect(dailyDeltas[0]).toMatchObject({
      currencyCode: 'USD',
      accountType: AccountType.ASSET,
      delta: 10,
    });
  });

  it('ranks equal timestamps identically across native SQL and ORM adapters', async () => {
    const tieDate = DAY + 10_000;
    await createJournalFixture(
      {
        description: 'Lower id tie',
        journalDate: tieDate,
        currencyCode: 'USD',
        calculatedBalances: new Map([[localAccountId, 100]]),
        transactions: [
          { accountId: localAccountId, amount: 100, transactionType: TransactionType.DEBIT },
        ],
      },
      WORKPLACE_ONE,
    );
    await createJournalFixture(
      {
        description: 'Higher id tie',
        journalDate: tieDate,
        currencyCode: 'USD',
        calculatedBalances: new Map([[localAccountId, 200]]),
        transactions: [
          { accountId: localAccountId, amount: 200, transactionType: TransactionType.DEBIT },
        ],
      },
      WORKPLACE_ONE,
    );

    const tiedTransactions = await database.collections
      .get<Transaction>('transactions')
      .query(Q.where('account_id', localAccountId), Q.where('transaction_date', tieDate))
      .fetch();
    expect(tiedTransactions).toHaveLength(2);

    const highestIdTransaction = tiedTransactions.reduce((highest, transaction) =>
      transaction.id > highest.id ? transaction : highest,
    );
    const sharedCreatedAt = new Date(2025, 0, 15, 12, 0, 0, 123);
    await database.write(async () => {
      await database.batch(
        tiedTransactions.map(transaction =>
          transaction.prepareUpdate(record => {
            record.createdAt = sharedCreatedAt;
          }),
        ),
      );
    });

    const nativeQuery = jest.spyOn(rawSqlExecutor, 'query').mockResolvedValue([
      {
        accountId: localAccountId,
        runningBalance: highestIdTransaction.runningBalance,
      },
    ]);
    const nativeBalances = await transactionRawMetricsQueries.getLatestBalancesRaw(
      WORKPLACE_ONE,
      [localAccountId],
      tieDate,
    );

    nativeQuery.mockResolvedValue(null);
    const ormBalances = await transactionRawMetricsQueries.getLatestBalancesRaw(
      WORKPLACE_ONE,
      [localAccountId],
      tieDate,
    );

    expect(ormBalances).toEqual(nativeBalances);
    expect(ormBalances.get(localAccountId)).toBe(highestIdTransaction.runningBalance);
  });
});
