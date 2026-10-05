import { accountLedgerMetricsQueries } from '@/src/data/repositories/account/AccountLedgerMetricsQueries';
import { rawSqlExecutor } from '@/src/data/repositories/raw/RawSqlExecutor';
import { transactionRawMetricsQueries } from '@/src/data/repositories/raw/TransactionRawMetricsQueries';
import { transactionRawRebuildQueries } from '@/src/data/repositories/raw/TransactionRawRebuildQueries';
import { transactionInsightQueries } from '@/src/data/repositories/transaction/TransactionInsightQueries';
import { transactionObserveQueries } from '@/src/data/repositories/transaction';
import {
  setupTwoWorkplaceLedgerFixture,
  TWO_WORKPLACE_LEDGER_ONE,
} from '@/src/testing/twoWorkplaceLedgerFixture';
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus';
import { AccountId, TransactionId } from '@/src/types/ids';
import { AccountType } from '@/src/types/enums';
import { firstValueFrom, of, take } from 'rxjs';

describe('named raw-query workplace isolation', () => {
  let accountId: AccountId;
  let foreignAccountId: AccountId;

  beforeEach(async () => {
    jest.restoreAllMocks();
    ({ accountId, foreignAccountId } = await setupTwoWorkplaceLedgerFixture());
  });

  it('scopes transaction-count SQL to both transaction and journal workplace', async () => {
    const queryRaw = jest.spyOn(rawSqlExecutor, 'query').mockResolvedValue([]);

    await transactionRawMetricsQueries.getAccountTransactionCounts(
      TWO_WORKPLACE_LEDGER_ONE,
      [{ accountId, startDate: 0 }],
      Number.MAX_SAFE_INTEGER,
    );

    const [sql, args = []] = queryRaw.mock.calls[0];
    expect(sql).toContain('t.workplace_id = ?');
    expect(sql).toContain('j.workplace_id = ?');
    expect(args.filter(arg => arg === TWO_WORKPLACE_LEDGER_ONE)).toHaveLength(2);
  });

  it('isolates transaction counts by workplace in the ORM fallback', async () => {
    jest.spyOn(rawSqlExecutor, 'query').mockResolvedValue(null);

    const counts = await transactionRawMetricsQueries.getAccountTransactionCounts(
      TWO_WORKPLACE_LEDGER_ONE,
      [{ accountId, startDate: 0 }],
      Number.MAX_SAFE_INTEGER,
    );

    expect(counts.get(accountId)).toBe(1);
  });

  it('scopes rebuild SQL to both transaction and journal workplace', async () => {
    const queryRaw = jest.spyOn(rawSqlExecutor, 'query').mockResolvedValue([]);

    await transactionRawRebuildQueries.getRebuildDataRaw(TWO_WORKPLACE_LEDGER_ONE, accountId, 0);

    const [sql, args = []] = queryRaw.mock.calls[0];
    expect(sql).toContain('t.workplace_id = ?');
    expect(sql).toContain('j.workplace_id = ?');
    expect(args.filter(arg => arg === TWO_WORKPLACE_LEDGER_ONE)).toHaveLength(2);
  });

  it('isolates rebuild data by workplace in the ORM fallback', async () => {
    jest.spyOn(rawSqlExecutor, 'query').mockResolvedValue(null);

    const transactions = await transactionRawRebuildQueries.getRebuildDataRaw(
      TWO_WORKPLACE_LEDGER_ONE,
      accountId,
      0,
    );

    expect(transactions).toHaveLength(1);
    expect(transactions[0]).toMatchObject({ amount: 10, transactionDate: 1_000 });
  });

  it('scopes account-sum SQL and cursor subqueries to both workplaces', async () => {
    const queryRaw = jest.spyOn(rawSqlExecutor, 'query').mockResolvedValue([]);

    await transactionRawRebuildQueries.getAccountSumRaw(
      TWO_WORKPLACE_LEDGER_ONE,
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
    expect(args.filter(arg => arg === TWO_WORKPLACE_LEDGER_ONE)).toHaveLength(22);
    expect(args).toHaveLength(4 + ACTIVE_JOURNAL_STATUSES.length + 32);
    expect(sql.match(/\?/g) ?? []).toHaveLength(args.length);
  });

  it('isolates account sums by transaction workplace in the ORM fallback', async () => {
    jest.spyOn(rawSqlExecutor, 'query').mockResolvedValue(null);

    const sum = await transactionRawRebuildQueries.getAccountSumRaw(
      TWO_WORKPLACE_LEDGER_ONE,
      accountId,
      Number.MAX_SAFE_INTEGER,
      AccountType.ASSET,
    );

    expect(sum).toBe(10);
  });

  it('scopes metadata SQL to transaction, journal, and account workplaces', async () => {
    const queryRaw = jest.spyOn(rawSqlExecutor, 'query').mockResolvedValue([]);

    await transactionInsightQueries.findActiveMetadata(
      TWO_WORKPLACE_LEDGER_ONE,
      [accountId, foreignAccountId],
      0,
      5_000,
    );

    const [sql, args = []] = queryRaw.mock.calls[0];
    expect(sql).toContain('t.workplace_id = ?');
    expect(sql).toContain('a.workplace_id = ?');
    expect(sql).toContain('j.workplace_id = ?');
    expect(args.filter(arg => arg === TWO_WORKPLACE_LEDGER_ONE)).toHaveLength(3);
    expect(args.slice(4, 7)).toEqual([
      TWO_WORKPLACE_LEDGER_ONE,
      TWO_WORKPLACE_LEDGER_ONE,
      TWO_WORKPLACE_LEDGER_ONE,
    ]);
  });

  it('isolates metadata in the ORM fallback despite malformed cross-workplace links', async () => {
    jest.spyOn(rawSqlExecutor, 'query').mockResolvedValue(null);

    const metadata = await transactionInsightQueries.findActiveMetadata(
      TWO_WORKPLACE_LEDGER_ONE,
      [accountId, foreignAccountId],
      0,
      5_000,
    );

    expect(metadata).toHaveLength(1);
    expect(metadata[0]).toMatchObject({ accountId, amount: 10, transactionDate: 1_000 });
  });

  it('scopes bulk period SQL to transaction, journal, and account workplaces', async () => {
    const queryRaw = jest.spyOn(rawSqlExecutor, 'query').mockResolvedValue([]);

    await accountLedgerMetricsQueries.getPeriodMetricsByAccount(
      TWO_WORKPLACE_LEDGER_ONE,
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
    expect(args.filter(arg => arg === TWO_WORKPLACE_LEDGER_ONE)).toHaveLength(3);
    expect(args.slice(0, 3)).toEqual([
      TWO_WORKPLACE_LEDGER_ONE,
      TWO_WORKPLACE_LEDGER_ONE,
      TWO_WORKPLACE_LEDGER_ONE,
    ]);
  });

  it('keeps bulk period fallback metrics isolated despite malformed links', async () => {
    jest.spyOn(rawSqlExecutor, 'query').mockResolvedValue(null);

    const metrics = await accountLedgerMetricsQueries.getPeriodMetricsByAccount(
      TWO_WORKPLACE_LEDGER_ONE,
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
    jest.spyOn(transactionObserveQueries, 'observeActiveCount').mockReturnValue(of(0));
    const queryRaw = jest.spyOn(rawSqlExecutor, 'query').mockResolvedValue([]);

    await firstValueFrom(
      accountLedgerMetricsQueries
        .observeUnreconciledMetrics(TWO_WORKPLACE_LEDGER_ONE, accountId, null, AccountType.ASSET)
        .pipe(take(1)),
    );

    const [sql, args = []] = queryRaw.mock.calls[0];
    expect(sql).toContain('t.workplace_id = ?');
    expect(sql).toContain('a.workplace_id = ?');
    expect(sql).toContain('j.workplace_id = ?');
    expect(args.filter(arg => arg === TWO_WORKPLACE_LEDGER_ONE)).toHaveLength(3);
    expect(args.slice(2)).toEqual([
      0,
      null,
      TWO_WORKPLACE_LEDGER_ONE,
      TWO_WORKPLACE_LEDGER_ONE,
      TWO_WORKPLACE_LEDGER_ONE,
      'POSTED',
      'REVERSED',
    ]);
  });

  it('emits isolated unreconciled fallback metrics for local and foreign accounts', async () => {
    jest.spyOn(transactionObserveQueries, 'observeActiveCount').mockReturnValue(of(0));
    jest.spyOn(rawSqlExecutor, 'query').mockResolvedValue(null);

    const localMetrics = await firstValueFrom(
      accountLedgerMetricsQueries
        .observeUnreconciledMetrics(TWO_WORKPLACE_LEDGER_ONE, accountId, null, AccountType.ASSET)
        .pipe(take(1)),
    );
    const foreignMetrics = await firstValueFrom(
      accountLedgerMetricsQueries
        .observeUnreconciledMetrics(
          TWO_WORKPLACE_LEDGER_ONE,
          foreignAccountId,
          null,
          AccountType.ASSET,
        )
        .pipe(take(1)),
    );

    expect(localMetrics).toEqual({ count: 1, total: 10 });
    expect(foreignMetrics).toEqual({ count: 0, total: 0 });
  });
});
