import { database } from '@/src/data/database/Database';
import Transaction from '@/src/data/models/Transaction';
import { accountListMetricsQueries } from '@/src/data/repositories/account/AccountListMetricsQueries';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { journalWriteRepository } from '@/src/data/repositories/journal/journalWriteModule';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import { AccountId, AccountType, TransactionType, WorkplaceId } from '@/src/types/domain';
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus';
import { Q } from '@nozbe/watermelondb';

const WORKPLACE_ONE = 'wp-account-list-metrics-1' as WorkplaceId;
const WORKPLACE_TWO = 'wp-account-list-metrics-2' as WorkplaceId;
const DAY = new Date(2025, 0, 15, 12).getTime();

describe('AccountListMetricsQueries workplace isolation', () => {
  let localAccountId: AccountId;
  let foreignAccountId: AccountId;

  beforeEach(async () => {
    jest.restoreAllMocks();
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });

    await workplaceRepository.create({
      id: WORKPLACE_ONE,
      name: 'Account List Workplace One',
      icon: 'home',
      defaultCurrencyCode: 'USD',
    });
    await workplaceRepository.create({
      id: WORKPLACE_TWO,
      name: 'Account List Workplace Two',
      icon: 'briefcase',
      defaultCurrencyCode: 'USD',
    });

    const localAccount = await accountRepository.create({
      name: 'Local account',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WORKPLACE_ONE,
    });
    const foreignAccount = await accountRepository.create({
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

    await journalWriteRepository.createJournalWithTransactions(
      {
        description: 'Valid foreign transaction',
        journalDate: DAY + 1_000,
        currencyCode: 'USD',
        calculatedBalances: new Map([[foreignAccountId, 20]]),
        transactions: [
          { accountId: foreignAccountId, amount: 20, transactionType: TransactionType.DEBIT },
        ],
      },
      WORKPLACE_TWO,
    );

    // Local transaction and journal linked to a foreign account.
    await journalWriteRepository.createJournalWithTransactions(
      {
        description: 'Malformed foreign account link',
        journalDate: DAY + 2_000,
        currencyCode: 'USD',
        calculatedBalances: new Map([[foreignAccountId, 30]]),
        transactions: [
          { accountId: foreignAccountId, amount: 30, transactionType: TransactionType.DEBIT },
        ],
      },
      WORKPLACE_ONE,
    );

    // Foreign journal linked to the local account; rewrite only the transaction
    // workplace so the journal predicate is solely responsible for rejecting it.
    const foreignJournal = await journalWriteRepository.createJournalWithTransactions(
      {
        description: 'Malformed foreign journal link',
        journalDate: DAY + 3_000,
        currencyCode: 'USD',
        calculatedBalances: new Map([[localAccountId, 40]]),
        transactions: [
          { accountId: localAccountId, amount: 40, transactionType: TransactionType.DEBIT },
        ],
      },
      WORKPLACE_TWO,
    );

    // Local account and journal with a foreign transaction workplace.
    const localJournal = await journalWriteRepository.createJournalWithTransactions(
      {
        description: 'Malformed foreign transaction link',
        journalDate: DAY + 4_000,
        currencyCode: 'USD',
        calculatedBalances: new Map([[localAccountId, 50]]),
        transactions: [
          { accountId: localAccountId, amount: 50, transactionType: TransactionType.DEBIT },
        ],
      },
      WORKPLACE_ONE,
    );

    const [foreignJournalTransaction] = await database.collections
      .get<Transaction>('transactions')
      .query(Q.where('journal_id', foreignJournal.id))
      .fetch();
    const [foreignTransaction] = await database.collections
      .get<Transaction>('transactions')
      .query(Q.where('journal_id', localJournal.id))
      .fetch();
    await database.write(async () => {
      await foreignJournalTransaction.update(transaction => {
        transaction.workplaceId = WORKPLACE_ONE;
      });
      await foreignTransaction.update(transaction => {
        transaction.workplaceId = WORKPLACE_TWO;
      });
    });
  });

  it('scopes accounts, transactions, and journals in every raw SQL branch', async () => {
    const queryRaw = jest.spyOn(transactionRawRepository, 'queryRaw').mockResolvedValue([]);

    await accountListMetricsQueries.getAccountListItemsRaw(
      DAY - 1,
      DAY + 5_000,
      WORKPLACE_ONE,
      true,
    );

    const [sql, args = []] = queryRaw.mock.calls[0];
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
    expect(sql.match(/\?/g) ?? []).toHaveLength(args.length);
  });

  it('matches scoped list metrics in the ORM fallback despite malformed links', async () => {
    jest.spyOn(transactionRawRepository, 'queryRaw').mockResolvedValue(null);

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
