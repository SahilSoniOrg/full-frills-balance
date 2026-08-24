import { database } from '@/src/data/database/Database';
import { accountWriteRepository } from '@/src/data/repositories/account';
import { journalWriteRepository } from '@/src/data/repositories/journal/journalWriteModule';
import { transactionRawMetricsQueries } from '@/src/data/repositories/raw/TransactionRawMetricsQueries';
import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { AccountType, TransactionType } from '@/src/types/enums';

const WORKPLACE_ONE = 'wp-metrics-isolation-1' as WorkplaceId;
const WORKPLACE_TWO = 'wp-metrics-isolation-2' as WorkplaceId;
const DAY = new Date(2025, 0, 15, 12).getTime();

describe('TransactionRawMetricsQueries workplace isolation', () => {
  let localAccountId: AccountId;
  let foreignAccountId: AccountId;

  beforeEach(async () => {
    jest.restoreAllMocks();
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });

    await workplaceRepository.create({
      id: WORKPLACE_ONE,
      name: 'Metrics Workplace One',
      icon: 'home',
      defaultCurrencyCode: 'USD',
    });
    await workplaceRepository.create({
      id: WORKPLACE_TWO,
      name: 'Metrics Workplace Two',
      icon: 'briefcase',
      defaultCurrencyCode: 'USD',
    });

    const localAccount = await accountWriteRepository.create({
      name: 'Local account',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WORKPLACE_ONE,
    });
    const foreignAccount = await accountWriteRepository.create({
      name: 'Foreign account',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WORKPLACE_TWO,
    });
    localAccountId = localAccount.id;
    foreignAccountId = foreignAccount.id;

    await journalWriteRepository.createJournalWithTransactions(
      {
        description: 'Valid local transaction',
        journalDate: DAY,
        currencyCode: 'USD',
        calculatedBalances: new Map([[localAccountId, 10]]),
        transactions: [
          { accountId: localAccountId, amount: 10, transactionType: TransactionType.DEBIT },
        ],
      },
      WORKPLACE_ONE,
    );

    // Malformed imported relation: a workplace-one transaction points at a
    // workplace-two account. Metrics must reject the joined foreign account.
    await journalWriteRepository.createJournalWithTransactions(
      {
        description: 'Foreign account link',
        journalDate: DAY + 1_000,
        currencyCode: 'USD',
        calculatedBalances: new Map([[foreignAccountId, 20]]),
        transactions: [
          { accountId: foreignAccountId, amount: 20, transactionType: TransactionType.DEBIT },
        ],
      },
      WORKPLACE_ONE,
    );

    // Malformed imported relation in the opposite direction: a workplace-two
    // transaction points at the workplace-one account.
    await journalWriteRepository.createJournalWithTransactions(
      {
        description: 'Foreign transaction link',
        journalDate: DAY + 2_000,
        currencyCode: 'USD',
        calculatedBalances: new Map([[localAccountId, 30]]),
        transactions: [
          { accountId: localAccountId, amount: 30, transactionType: TransactionType.DEBIT },
        ],
      },
      WORKPLACE_TWO,
    );
  });

  it('scopes every workplace-owned SQL table for all three metrics queries', async () => {
    const queryRaw = jest.spyOn(transactionRawMetricsQueries, 'queryRaw').mockResolvedValue([]);
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
    await transactionRawMetricsQueries.getAccountDeltasGroupedRaw(
      WORKPLACE_ONE,
      accountIds,
      DAY - 1,
      DAY + 3_000,
    );

    expect(queryRaw).toHaveBeenCalledTimes(3);
    for (const [sql, args = []] of queryRaw.mock.calls) {
      expect(sql).toContain('t.workplace_id = ?');
      expect(sql).toContain('a.workplace_id = ?');
      expect(sql).toContain('j.workplace_id = ?');
      expect(args.filter(arg => arg === WORKPLACE_ONE)).toHaveLength(3);
    }
  });

  it('rejects malformed cross-workplace links in every ORM fallback', async () => {
    jest.spyOn(transactionRawMetricsQueries, 'queryRaw').mockResolvedValue(null);
    const accountIds = [localAccountId, foreignAccountId];

    const [latestBalances, dailyDeltas, accountDeltas] = await Promise.all([
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
      transactionRawMetricsQueries.getAccountDeltasGroupedRaw(
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
    expect(accountDeltas).toEqual([{ accountId: localAccountId, currencyCode: 'USD', delta: 10 }]);
  });
});
