import { accountListMetricsQueries } from '@/src/data/repositories/account/AccountListMetricsQueries';
import { rawSqlExecutor } from '@/src/data/repositories/raw/RawSqlExecutor';
import { seedAccountListMetricsWorkplaceIsolation } from '@/src/testing/rawQueryWorkplaceIsolationHarness';
import { lastRawSqlCall, expectRawSqlPlaceholderArity } from '@/src/testing/rawSqlTestHelpers';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus';

const WORKPLACE_ONE = 'wp-account-list-metrics-1' as WorkplaceId;
const WORKPLACE_TWO = 'wp-account-list-metrics-2' as WorkplaceId;
const DAY = new Date(2025, 0, 15, 12).getTime();

describe('AccountListMetricsQueries workplace isolation', () => {
  let localAccountId: AccountId;
  let foreignAccountId: AccountId;

  beforeEach(async () => {
    ({ localAccountId, foreignAccountId } = await seedAccountListMetricsWorkplaceIsolation(
      WORKPLACE_ONE,
      WORKPLACE_TWO,
      DAY,
    ));
  });

  it('scopes accounts, transactions, and journals in every raw SQL branch', async () => {
    const queryRaw = jest.spyOn(rawSqlExecutor, 'query').mockResolvedValue([]);

    await accountListMetricsQueries.getAccountListItemsRaw(
      DAY - 1,
      DAY + 5_000,
      WORKPLACE_ONE,
      true,
    );

    const [sql, args] = lastRawSqlCall(queryRaw);
    expect(sql.match(/t\.workplace_id = \?/g)).toHaveLength(2);
    expect(sql.match(/j\.workplace_id = \?/g)).toHaveLength(2);
    expect(sql.match(/a\.workplace_id = \?/g)).toHaveLength(2);
    expect(sql).toContain('SELECT id FROM accounts WHERE deleted_at IS NULL AND workplace_id = ?');
    expect(args).toEqual([
      WORKPLACE_ONE,
      WORKPLACE_ONE,
      ...ACTIVE_JOURNAL_STATUSES,
      WORKPLACE_ONE,
      DAY - 1,
      DAY + 5_000,
      DAY - 1,
      DAY + 5_000,
      WORKPLACE_ONE,
      WORKPLACE_ONE,
      ...ACTIVE_JOURNAL_STATUSES,
      WORKPLACE_ONE,
      WORKPLACE_ONE,
    ]);
    expect(args.filter(arg => arg === WORKPLACE_ONE)).toHaveLength(7);
    expect(args).toHaveLength(11 + ACTIVE_JOURNAL_STATUSES.length * 2);
    expectRawSqlPlaceholderArity(sql, args);
  });

  it('matches scoped list metrics in the ORM fallback despite malformed links', async () => {
    jest.spyOn(rawSqlExecutor, 'query').mockResolvedValue(null);

    const rows = await accountListMetricsQueries.getAccountListItemsRaw(
      DAY - 1,
      DAY + 5_000,
      WORKPLACE_ONE,
      true,
    );

    expect(rows).toEqual([
      expect.objectContaining({
        id: localAccountId,
        direct_balance: 10,
        direct_transaction_count: 1,
        periodIncrease: 10,
        periodDecrease: 0,
      }),
    ]);
    expect(rows?.some(row => row.id === foreignAccountId)).toBe(false);

    const laterPeriodRows = await accountListMetricsQueries.getAccountListItemsRaw(
      DAY + 10_000,
      DAY + 20_000,
      WORKPLACE_ONE,
    );
    expect(laterPeriodRows).toEqual([
      expect.objectContaining({
        id: localAccountId,
        direct_balance: 10,
        direct_transaction_count: 0,
        periodIncrease: 0,
        periodDecrease: 0,
      }),
    ]);
  });
});
