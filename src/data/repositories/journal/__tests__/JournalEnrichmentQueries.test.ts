import { Icon } from '@/src/types/domainIcons';
import { database } from '@/src/data/database/Database';
import Transaction from '@/src/data/models/Transaction';
import { accountWriteRepository } from '@/src/data/repositories/account';
import { journalEnrichmentQueries } from '@/src/data/repositories/journal/JournalEnrichmentQueries';
import { createJournalFixture } from '@/src/testing/journalFixtures';
import { rawSqlExecutor } from '@/src/data/repositories/raw/RawSqlExecutor';
import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import { AccountId, JournalId, WorkplaceId } from '@/src/types/ids';
import { AccountType, TransactionType } from '@/src/types/enums';

describe('JournalEnrichmentQueries workplace isolation', () => {
  const workplaceOne = 'wp-journal-enrichment-one' as WorkplaceId;
  const workplaceTwo = 'wp-journal-enrichment-two' as WorkplaceId;

  let workplaceOneAccountId: AccountId;
  let workplaceTwoAccountId: AccountId;
  let workplaceOneJournalId: JournalId;
  let workplaceTwoJournalId: JournalId;
  const recentJournalDate = () => Date.now();

  beforeEach(async () => {
    jest.restoreAllMocks();
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });

    await workplaceRepository.create({
      id: workplaceOne,
      name: 'Workplace One',
      icon: Icon.Home,
      defaultCurrencyCode: 'USD',
    });
    await workplaceRepository.create({
      id: workplaceTwo,
      name: 'Workplace Two',
      icon: Icon.Briefcase,
      defaultCurrencyCode: 'USD',
    });

    const workplaceOneAccount = await accountWriteRepository.create({
      name: 'Workplace One Checking',
      accountType: AccountType.ASSET,
      color: '#CDAA6B',
      currencyCode: 'USD',
      workplaceId: workplaceOne,
    });
    const workplaceTwoAccount = await accountWriteRepository.create({
      name: 'Foreign Expense',
      accountType: AccountType.EXPENSE,
      currencyCode: 'USD',
      workplaceId: workplaceTwo,
    });
    workplaceOneAccountId = workplaceOneAccount.id;
    workplaceTwoAccountId = workplaceTwoAccount.id;

    const workplaceOneJournal = await createJournalFixture(
      {
        description: 'Coffee',
        journalDate: recentJournalDate(),
        currencyCode: 'USD',
        transactions: [
          {
            accountId: workplaceOneAccountId,
            amount: 10,
            transactionType: TransactionType.DEBIT,
          },
        ],
      },
      workplaceOne,
    );
    const workplaceTwoJournal = await createJournalFixture(
      {
        description: 'Coffee',
        journalDate: recentJournalDate() - 1_000,
        currencyCode: 'USD',
        transactions: [
          {
            accountId: workplaceTwoAccountId,
            amount: 20,
            transactionType: TransactionType.DEBIT,
          },
        ],
      },
      workplaceTwo,
    );
    workplaceOneJournalId = workplaceOneJournal.id;
    workplaceTwoJournalId = workplaceTwoJournal.id;

    const transactions = database.collections.get<Transaction>('transactions');
    await database.write(async () => {
      await transactions.create(transaction => {
        transaction.journalId = workplaceOneJournalId;
        transaction.accountId = workplaceTwoAccountId;
        transaction.amount = 30;
        transaction.transactionType = TransactionType.DEBIT;
        transaction.currencyCode = 'USD';
        transaction.transactionDate = 2_000;
        transaction.workplaceId = workplaceTwo;
        transaction.createdAt = new Date();
        transaction.updatedAt = new Date();
      });
      await transactions.create(transaction => {
        transaction.journalId = workplaceOneJournalId;
        transaction.accountId = workplaceTwoAccountId;
        transaction.amount = 40;
        transaction.transactionType = TransactionType.DEBIT;
        transaction.currencyCode = 'USD';
        transaction.transactionDate = 2_000;
        transaction.workplaceId = workplaceOne;
        transaction.createdAt = new Date();
        transaction.updatedAt = new Date();
      });
    });
  });

  it('scopes raw enrichment joins to journals, transactions, and accounts', async () => {
    const queryRaw = jest.spyOn(rawSqlExecutor, 'query').mockResolvedValue([]);

    await journalEnrichmentQueries.getEnrichmentDataRaw(workplaceOne, [
      workplaceOneJournalId,
      workplaceTwoJournalId,
    ]);

    const [sql, args = []] = queryRaw.mock.calls[0];
    expect(sql).toContain('j.workplace_id = ?');
    expect(sql).toContain('t.workplace_id = ?');
    expect(sql).toContain('a.workplace_id = ?');
    expect(sql).toContain('a.currency_code as account_currency_code');
    expect(sql).toContain('t.id as transaction_id');
    expect(sql).toContain('t.exchange_rate as exchange_rate');
    expect(sql).toContain('a.color as account_color');
    expect(args.filter(arg => arg === workplaceOne)).toHaveLength(3);
  });

  it('isolates enrichment fallback from mixed journal IDs and malformed links', async () => {
    jest.spyOn(rawSqlExecutor, 'query').mockResolvedValue(null);

    const rows = await journalEnrichmentQueries.getEnrichmentDataRaw(workplaceOne, [
      workplaceOneJournalId,
      workplaceTwoJournalId,
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      journal_id: workplaceOneJournalId,
      account_id: workplaceOneAccountId,
      account_name: 'Workplace One Checking',
      account_color: '#CDAA6B',
      amount: 10,
      account_currency_code: 'USD',
    });
  });

  it('uses the immutable account currency when a saved transaction currency differs', async () => {
    jest.spyOn(rawSqlExecutor, 'query').mockResolvedValue(null);
    const transactions = await database.collections
      .get<Transaction>('transactions')
      .query()
      .fetch();
    const line = transactions.find(
      tx => tx.journalId === workplaceOneJournalId && tx.accountId === workplaceOneAccountId,
    );
    expect(line).toBeDefined();
    await database.write(async () => {
      await line!.update(tx => {
        tx.currencyCode = 'EUR';
        tx.exchangeRate = 1.25;
      });
    });

    const rows = await journalEnrichmentQueries.getEnrichmentDataRaw(workplaceOne, [
      workplaceOneJournalId,
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].account_currency_code).toBe('USD');
    expect(rows[0].transaction_id).toBe(line!.id);
    expect(rows[0].exchange_rate).toBe(1.25);
  });

  it('scopes suggestion joins and applies the bounded three-month description query', async () => {
    const queryRaw = jest.spyOn(rawSqlExecutor, 'query').mockResolvedValue([]);

    await journalEnrichmentQueries.findJournalSuggestions({
      workplaceId: workplaceOne,
      query: 'coffee',
      page: 'simple',
      limit: 3,
    });

    const [sql, args = []] = queryRaw.mock.calls[0];
    expect(sql).toContain('j.workplace_id = ?');
    expect(sql).toContain('t.workplace_id = j.workplace_id');
    expect(sql).toContain('a.workplace_id = j.workplace_id');
    expect(sql).not.toContain('journal_date >= ?');
    expect(sql).toContain('LOWER(description) LIKE LOWER(?)');
    expect(args.filter(arg => arg === workplaceOne)).toHaveLength(2);
    expect(args).toContain('%coffee%');
    expect(args).toContain(3);
    expect(args.filter((arg): arg is number => typeof arg === 'number')).toEqual([3]);
  });

  it('isolates fallback rows from foreign-workplace links and drops incomplete routes', async () => {
    jest.spyOn(rawSqlExecutor, 'query').mockResolvedValue(null);

    const suggestions = await journalEnrichmentQueries.findJournalSuggestions({
      workplaceId: workplaceOne,
      query: '',
      page: 'simple',
      limit: 10,
    });

    expect(suggestions).toEqual([]);
  });

  it('shows every applicable route shape in split and advanced modes without merging journals', async () => {
    const [source, secondSource] = await Promise.all(
      ['Federal FI', 'Savings'].map(name =>
        accountWriteRepository.create({
          name,
          accountType: AccountType.ASSET,
          currencyCode: 'USD',
          workplaceId: workplaceOne,
        }),
      ),
    );
    const [groceries, foodAndDrinks, rent, utilities] = await Promise.all(
      ['Groceries', 'Food & Drinks', 'Rent', 'Utilities'].map(name =>
        accountWriteRepository.create({
          name,
          accountType: AccountType.EXPENSE,
          currencyCode: 'USD',
          workplaceId: workplaceOne,
        }),
      ),
    );
    const createRoute = (description: string, credits: AccountId[], debits: AccountId[]) =>
      createJournalFixture(
        {
          description,
          journalDate: recentJournalDate(),
          currencyCode: 'USD',
          transactions: [
            ...credits.map(accountId => ({
              accountId,
              amount: 10,
              transactionType: TransactionType.CREDIT,
            })),
            ...debits.map(accountId => ({
              accountId,
              amount: 10,
              transactionType: TransactionType.DEBIT,
            })),
          ],
        },
        workplaceOne,
      );

    await createRoute('Milk', [source.id], [groceries.id]);
    await createRoute('Milk', [source.id], [foodAndDrinks.id]);
    await createRoute('One meal', [source.id], [groceries.id]);
    await createRoute('Split meal', [source.id], [groceries.id, foodAndDrinks.id]);
    await createRoute('Reverse meal', [source.id, secondSource.id], [rent.id]);
    await createRoute('Advanced meal', [source.id, secondSource.id], [rent.id, utilities.id]);

    const simpleSuggestions = await journalEnrichmentQueries.findJournalSuggestions({
      workplaceId: workplaceOne,
      query: 'Milk',
      page: 'simple',
      limit: 20,
    });
    const milkSuggestions = simpleSuggestions.filter(
      suggestion => suggestion.description === 'Milk',
    );
    expect(milkSuggestions).toHaveLength(2);
    expect(
      milkSuggestions.map(suggestion => suggestion.route.destinations.map(account => account.id)),
    ).toEqual(expect.arrayContaining([[groceries.id], [foodAndDrinks.id]]));

    const splitSuggestions = await journalEnrichmentQueries.findJournalSuggestions({
      workplaceId: workplaceOne,
      query: 'meal',
      page: 'split',
      limit: 20,
    });
    expect(new Set(splitSuggestions.map(suggestion => suggestion.description))).toEqual(
      new Set(['One meal', 'Split meal']),
    );
    const oneToOneSplit = splitSuggestions.find(
      suggestion => suggestion.description === 'One meal',
    );
    expect(oneToOneSplit?.route).toMatchObject({
      sources: [expect.objectContaining({ id: source.id })],
      destinations: [expect.objectContaining({ id: groceries.id })],
    });
    const oneToManySplit = splitSuggestions.find(
      suggestion => suggestion.description === 'Split meal',
    );
    expect(oneToManySplit?.route).toMatchObject({
      sources: [expect.objectContaining({ id: source.id })],
      destinations: expect.arrayContaining([
        expect.objectContaining({ id: groceries.id }),
        expect.objectContaining({ id: foodAndDrinks.id }),
      ]),
    });

    const advancedSuggestions = await journalEnrichmentQueries.findJournalSuggestions({
      workplaceId: workplaceOne,
      query: 'meal',
      page: 'advanced',
      limit: 20,
    });
    expect(new Set(advancedSuggestions.map(suggestion => suggestion.description))).toEqual(
      new Set(['One meal', 'Split meal', 'Reverse meal', 'Advanced meal']),
    );
    expect(
      advancedSuggestions.find(suggestion => suggestion.description === 'Reverse meal')?.route,
    ).toMatchObject({
      sources: expect.arrayContaining([
        expect.objectContaining({ id: source.id }),
        expect.objectContaining({ id: secondSource.id }),
      ]),
      destinations: [expect.objectContaining({ id: rent.id })],
    });
    const manyToMany = advancedSuggestions.find(
      suggestion => suggestion.description === 'Advanced meal',
    );
    expect(manyToMany?.route).toMatchObject({
      sources: expect.arrayContaining([
        expect.objectContaining({ id: source.id }),
        expect.objectContaining({ id: secondSource.id }),
      ]),
      destinations: expect.arrayContaining([
        expect.objectContaining({ id: rent.id }),
        expect.objectContaining({ id: utilities.id }),
      ]),
    });
  });
});
