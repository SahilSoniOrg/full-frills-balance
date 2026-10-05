import { createJournalFixture } from '@/src/testing/journalFixtures';
import { transactionRawPatternQueries } from '@/src/data/repositories/raw/TransactionRawPatternQueries';
import { rawSqlExecutor } from '@/src/data/repositories/raw/RawSqlExecutor';
import {
  createIsolationAssetAccounts,
  createMalformedCrossAccountTransaction,
  createRawQueryIsolationWorkplaces,
  resetRawQueryIsolationDatabase,
} from '@/src/testing/rawQueryWorkplaceIsolationHarness';
import { expectRawSqlPlaceholderArity, lastRawSqlCall } from '@/src/testing/rawSqlTestHelpers';
import { AccountId, JournalId, WorkplaceId } from '@/src/types/ids';
import { TransactionType } from '@/src/types/enums';
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus';

describe('TransactionRawPatternQueries workplace isolation', () => {
  const workplaceOne = 'wp-pattern-one' as WorkplaceId;
  const workplaceTwo = 'wp-pattern-two' as WorkplaceId;
  const startDate = 1_000;
  let localAccountId: AccountId;
  let foreignAccountId: AccountId;
  let localJournalId: JournalId;
  let foreignJournalId: JournalId;

  beforeEach(async () => {
    await resetRawQueryIsolationDatabase();
    await createRawQueryIsolationWorkplaces(workplaceOne, workplaceTwo, {
      one: 'Pattern Workplace One',
      two: 'Pattern Workplace Two',
    });
    ({ localAccountId, foreignAccountId } = await createIsolationAssetAccounts(
      workplaceOne,
      workplaceTwo,
    ));

    const localJournal = await createJournalFixture(
      {
        description: 'Local recurring payment',
        journalDate: startDate,
        currencyCode: 'USD',
        transactions: [
          { accountId: localAccountId, amount: 10, transactionType: TransactionType.DEBIT },
        ],
      },
      workplaceOne,
    );
    const foreignJournal = await createJournalFixture(
      {
        description: 'Foreign recurring payment',
        journalDate: startDate,
        currencyCode: 'USD',
        transactions: [
          { accountId: foreignAccountId, amount: 20, transactionType: TransactionType.DEBIT },
        ],
      },
      workplaceTwo,
    );
    localJournalId = localJournal.id;
    foreignJournalId = foreignJournal.id;

    await createMalformedCrossAccountTransaction({
      workplaceId: workplaceTwo,
      journalId: localJournalId,
      accountId: foreignAccountId,
      amount: 30,
      transactionDate: startDate,
    });
    await createMalformedCrossAccountTransaction({
      workplaceId: workplaceOne,
      journalId: foreignJournalId,
      accountId: localAccountId,
      amount: 40,
      transactionDate: startDate,
    });
  });

  it('scopes every workplace-owned SQL table with matching arguments', async () => {
    const queryRaw = jest.spyOn(rawSqlExecutor, 'query').mockResolvedValue([]);

    await transactionRawPatternQueries.getRecurringPatternsRaw(workplaceOne, startDate, 3);

    const [sql, args] = lastRawSqlCall(queryRaw);
    expect(sql).toContain('t.workplace_id = ?');
    expect(sql).toContain('j.workplace_id = ?');
    expect(args).toEqual([startDate, workplaceOne, workplaceOne, ...ACTIVE_JOURNAL_STATUSES, 3]);
    expectRawSqlPlaceholderArity(sql, args);
  });

  it('rejects both malformed cross-workplace join directions in the ORM fallback', async () => {
    jest.spyOn(rawSqlExecutor, 'query').mockResolvedValue(null);

    const patterns = await transactionRawPatternQueries.getRecurringPatternsRaw(
      workplaceOne,
      startDate,
      1,
    );

    expect(patterns).toHaveLength(1);
    expect(patterns[0]).toMatchObject({
      amount: 10,
      accountId: localAccountId,
      currencyCode: 'USD',
      occurrenceCount: 1,
      journalIds: localJournalId,
    });
  });
});
