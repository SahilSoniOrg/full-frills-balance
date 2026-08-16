import { database } from '@/src/data/database/Database';
import Transaction from '@/src/data/models/Transaction';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { journalWriteRepository } from '@/src/data/repositories/journal/journalWriteModule';
import { transactionRawMetricsQueries } from '@/src/data/repositories/raw/TransactionRawMetricsQueries';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus';
import {
  AccountId,
  AccountType,
  JournalId,
  TransactionId,
  TransactionType,
  WorkplaceId,
} from '@/src/types/domain';
import { firstValueFrom, of, take } from 'rxjs';

const WORKPLACE_ONE = 'wp-raw-isolation-1' as WorkplaceId;
const WORKPLACE_TWO = 'wp-raw-isolation-2' as WorkplaceId;

describe('TransactionRawRepository workplace isolation', () => {
  let accountId: AccountId;
  let foreignAccountId: AccountId;

  async function createMalformedTransaction({
    workplaceId,
    journalId,
    transactionAccountId,
    amount,
    transactionDate,
  }: {
    workplaceId: WorkplaceId;
    journalId: JournalId;
    transactionAccountId: AccountId;
    amount: number;
    transactionDate: number;
  }): Promise<void> {
    await database.write(async () => {
      await database.collections.get<Transaction>('transactions').create(transaction => {
        transaction.workplaceId = workplaceId;
        transaction.journalId = journalId;
        transaction.accountId = transactionAccountId;
        transaction.amount = amount;
        transaction.transactionType = TransactionType.DEBIT;
        transaction.currencyCode = 'USD';
        transaction.transactionDate = transactionDate;
        transaction.createdAt = new Date(transactionDate);
        transaction.updatedAt = new Date(transactionDate);
      });
    });
  }

  beforeEach(async () => {
    jest.restoreAllMocks();
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });

    await workplaceRepository.create({
      id: WORKPLACE_ONE,
      name: 'Workplace One',
      icon: 'home',
      defaultCurrencyCode: 'USD',
    });
    await workplaceRepository.create({
      id: WORKPLACE_TWO,
      name: 'Workplace Two',
      icon: 'briefcase',
      defaultCurrencyCode: 'USD',
    });

    const account = await accountRepository.create({
      name: 'Shared legacy account reference',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WORKPLACE_ONE,
    });
    accountId = account.id;
    const foreignAccount = await accountRepository.create({
      name: 'Foreign account',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WORKPLACE_TWO,
    });
    foreignAccountId = foreignAccount.id;

    await journalWriteRepository.createJournalWithTransactions(
      {
        description: 'Workplace one transaction',
        journalDate: 1_000,
        currencyCode: 'USD',
        transactions: [{ accountId, amount: 10, transactionType: TransactionType.DEBIT }],
      },
      WORKPLACE_ONE,
    );

    const localJournal = await journalWriteRepository.createJournalWithTransactions(
      {
        description: 'Local malformed-link host',
        journalDate: 2_000,
        currencyCode: 'USD',
        transactions: [],
      },
      WORKPLACE_ONE,
    );
    const foreignJournal = await journalWriteRepository.createJournalWithTransactions(
      {
        description: 'Foreign malformed-link host',
        journalDate: 3_000,
        currencyCode: 'USD',
        transactions: [],
      },
      WORKPLACE_TWO,
    );

    // Simulate independently malformed legacy/imported links. A safe read must
    // reject each row even when its other two ownership edges look local.
    await createMalformedTransaction({
      workplaceId: WORKPLACE_TWO,
      journalId: localJournal.id,
      transactionAccountId: accountId,
      amount: 100,
      transactionDate: 2_000,
    });
    await createMalformedTransaction({
      workplaceId: WORKPLACE_ONE,
      journalId: foreignJournal.id,
      transactionAccountId: accountId,
      amount: 200,
      transactionDate: 3_000,
    });
    await createMalformedTransaction({
      workplaceId: WORKPLACE_ONE,
      journalId: localJournal.id,
      transactionAccountId: foreignAccountId,
      amount: 400,
      transactionDate: 4_000,
    });
  });

  it('scopes transaction-count SQL to both transaction and journal workplace', async () => {
    const queryRaw = jest.spyOn(transactionRawRepository, 'queryRaw').mockResolvedValue([]);

    await transactionRawRepository.getAccountTransactionCountsRaw(
      WORKPLACE_ONE,
      [{ accountId, startDate: 0 }],
      Number.MAX_SAFE_INTEGER,
    );

    const [sql, args = []] = queryRaw.mock.calls[0];
    expect(sql).toContain('t.workplace_id = ?');
    expect(sql).toContain('j.workplace_id = ?');
    expect(args.filter(arg => arg === WORKPLACE_ONE)).toHaveLength(2);
  });

  it('isolates transaction counts by workplace in the ORM fallback', async () => {
    jest.spyOn(transactionRawRepository, 'queryRaw').mockResolvedValue(null);

    const counts = await transactionRawRepository.getAccountTransactionCountsRaw(
      WORKPLACE_ONE,
      [{ accountId, startDate: 0 }],
      Number.MAX_SAFE_INTEGER,
    );

    expect(counts.get(accountId)).toBe(1);
  });

  it('scopes rebuild SQL to both transaction and journal workplace', async () => {
    const queryRaw = jest.spyOn(transactionRawMetricsQueries, 'queryRaw').mockResolvedValue([]);

    await transactionRawRepository.getRebuildDataRaw(WORKPLACE_ONE, accountId, 0);

    const [sql, args = []] = queryRaw.mock.calls[0];
    expect(sql).toContain('t.workplace_id = ?');
    expect(sql).toContain('j.workplace_id = ?');
    expect(args.filter(arg => arg === WORKPLACE_ONE)).toHaveLength(2);
  });

  it('isolates rebuild data by workplace in the ORM fallback', async () => {
    jest.spyOn(transactionRawMetricsQueries, 'queryRaw').mockResolvedValue(null);

    const transactions = await transactionRawRepository.getRebuildDataRaw(
      WORKPLACE_ONE,
      accountId,
      0,
    );

    expect(transactions).toHaveLength(1);
    expect(transactions[0]).toMatchObject({ amount: 10, transactionDate: 1_000 });
  });

  it('scopes account-sum SQL and cursor subqueries to both workplaces', async () => {
    const queryRaw = jest.spyOn(transactionRawMetricsQueries, 'queryRaw').mockResolvedValue([]);

    await transactionRawRepository.getAccountSumRaw(
      WORKPLACE_ONE,
      accountId,
      Number.MAX_SAFE_INTEGER,
      AccountType.ASSET,
      'up-to-cursor' as TransactionId,
      'after-cursor' as TransactionId,
    );

    const [sql, args = []] = queryRaw.mock.calls[0];
    expect(sql).toContain('t.workplace_id = ?');
    expect(sql).toContain('j.workplace_id = ?');
    expect(sql).toContain('cursor_t.workplace_id = ?');
    expect(sql).toContain('cursor_j.workplace_id = ?');
    expect(args.filter(arg => arg === WORKPLACE_ONE)).toHaveLength(22);
    expect(args).toHaveLength(4 + ACTIVE_JOURNAL_STATUSES.length + 32);
    expect(sql.match(/\?/g) ?? []).toHaveLength(args.length);
  });

  it('isolates account sums by transaction workplace in the ORM fallback', async () => {
    jest.spyOn(transactionRawMetricsQueries, 'queryRaw').mockResolvedValue(null);

    const sum = await transactionRawRepository.getAccountSumRaw(
      WORKPLACE_ONE,
      accountId,
      Number.MAX_SAFE_INTEGER,
      AccountType.ASSET,
    );

    expect(sum).toBe(10);
  });

  it('scopes metadata SQL to transaction, journal, and account workplaces', async () => {
    const queryRaw = jest.spyOn(transactionRawRepository, 'queryRaw').mockResolvedValue([]);

    await transactionRawRepository.getTransactionsMetadataRaw(
      WORKPLACE_ONE,
      [accountId, foreignAccountId],
      0,
      5_000,
    );

    const [sql, args = []] = queryRaw.mock.calls[0];
    expect(sql).toContain('t.workplace_id = ?');
    expect(sql).toContain('a.workplace_id = ?');
    expect(sql).toContain('j.workplace_id = ?');
    expect(args.filter(arg => arg === WORKPLACE_ONE)).toHaveLength(3);
    expect(args.slice(4, 7)).toEqual([WORKPLACE_ONE, WORKPLACE_ONE, WORKPLACE_ONE]);
  });

  it('isolates metadata in the ORM fallback despite malformed cross-workplace links', async () => {
    jest.spyOn(transactionRawRepository, 'queryRaw').mockResolvedValue(null);

    const metadata = await transactionRawRepository.getTransactionsMetadataRaw(
      WORKPLACE_ONE,
      [accountId, foreignAccountId],
      0,
      5_000,
    );

    expect(metadata).toHaveLength(1);
    expect(metadata[0]).toMatchObject({ accountId, amount: 10, transactionDate: 1_000 });
  });

  it('scopes bulk period SQL to transaction, journal, and account workplaces', async () => {
    const queryRaw = jest.spyOn(transactionRawRepository, 'queryRaw').mockResolvedValue([]);

    await transactionRawRepository.getBulkAccountPeriodMetricsRaw(
      WORKPLACE_ONE,
      [
        { accountId, accountType: AccountType.ASSET },
        { accountId: foreignAccountId, accountType: AccountType.ASSET },
      ],
      0,
      5_000,
    );

    const [sql, args = []] = queryRaw.mock.calls[0];
    expect(sql).toContain('t.workplace_id = ?');
    expect(sql).toContain('a.workplace_id = ?');
    expect(sql).toContain('j.workplace_id = ?');
    expect(args.filter(arg => arg === WORKPLACE_ONE)).toHaveLength(3);
    expect(args.slice(0, 3)).toEqual([WORKPLACE_ONE, WORKPLACE_ONE, WORKPLACE_ONE]);
  });

  it('keeps bulk period fallback metrics isolated despite malformed links', async () => {
    jest.spyOn(transactionRawRepository, 'queryRaw').mockResolvedValue(null);

    const metrics = await transactionRawRepository.getBulkAccountPeriodMetricsRaw(
      WORKPLACE_ONE,
      [
        { accountId, accountType: AccountType.ASSET },
        { accountId: foreignAccountId, accountType: AccountType.ASSET },
      ],
      0,
      5_000,
    );

    expect(metrics.get(accountId)).toEqual({ totalIncrease: 10, totalDecrease: 0 });
    expect(metrics.get(foreignAccountId)).toEqual({ totalIncrease: 0, totalDecrease: 0 });
  });

  it('scopes unreconciled SQL to transaction, journal, and account workplaces', async () => {
    jest.spyOn(transactionRepository, 'observeActiveCount').mockReturnValue(of(0));
    const queryRaw = jest.spyOn(transactionRawRepository, 'queryRaw').mockResolvedValue([]);

    await firstValueFrom(
      transactionRawRepository
        .observeUnreconciledMetricsRaw(WORKPLACE_ONE, accountId, null, AccountType.ASSET)
        .pipe(take(1)),
    );

    const [sql, args = []] = queryRaw.mock.calls[0];
    expect(sql).toContain('t.workplace_id = ?');
    expect(sql).toContain('a.workplace_id = ?');
    expect(sql).toContain('j.workplace_id = ?');
    expect(args.filter(arg => arg === WORKPLACE_ONE)).toHaveLength(3);
    expect(args.slice(2)).toEqual([0, null, WORKPLACE_ONE, WORKPLACE_ONE, WORKPLACE_ONE]);
  });

  it('emits isolated unreconciled fallback metrics for local and foreign accounts', async () => {
    jest.spyOn(transactionRepository, 'observeActiveCount').mockReturnValue(of(0));
    jest.spyOn(transactionRawRepository, 'queryRaw').mockResolvedValue(null);

    const localMetrics = await firstValueFrom(
      transactionRawRepository
        .observeUnreconciledMetricsRaw(WORKPLACE_ONE, accountId, null, AccountType.ASSET)
        .pipe(take(1)),
    );
    const foreignMetrics = await firstValueFrom(
      transactionRawRepository
        .observeUnreconciledMetricsRaw(WORKPLACE_ONE, foreignAccountId, null, AccountType.ASSET)
        .pipe(take(1)),
    );

    expect(localMetrics).toEqual({ count: 1, total: 10 });
    expect(foreignMetrics).toEqual({ count: 0, total: 0 });
  });
});
