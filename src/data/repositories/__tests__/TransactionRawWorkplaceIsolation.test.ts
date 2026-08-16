import { database } from '@/src/data/database/Database';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { journalWriteRepository } from '@/src/data/repositories/journal/journalWriteModule';
import { transactionRawMetricsQueries } from '@/src/data/repositories/raw/TransactionRawMetricsQueries';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import { AccountId, AccountType, TransactionType, WorkplaceId } from '@/src/types/domain';

const WORKPLACE_ONE = 'wp-raw-isolation-1' as WorkplaceId;
const WORKPLACE_TWO = 'wp-raw-isolation-2' as WorkplaceId;

describe('TransactionRawRepository workplace isolation', () => {
  let accountId: AccountId;

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

    await journalWriteRepository.createJournalWithTransactions(
      {
        description: 'Workplace one transaction',
        journalDate: 1_000,
        currencyCode: 'USD',
        transactions: [{ accountId, amount: 10, transactionType: TransactionType.DEBIT }],
      },
      WORKPLACE_ONE,
    );

    // Simulate a legacy/imported cross-workplace account reference. Scoped reads
    // must remain isolated even when relational data is imperfect.
    await journalWriteRepository.createJournalWithTransactions(
      {
        description: 'Workplace two transaction',
        journalDate: 2_000,
        currencyCode: 'USD',
        transactions: [{ accountId, amount: 20, transactionType: TransactionType.DEBIT }],
      },
      WORKPLACE_TWO,
    );
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
});
