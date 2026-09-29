import { database } from '@/src/data/database/Database';
import { accountWriteRepository } from '@/src/data/repositories/account';
import { rawSqlExecutor } from '@/src/data/repositories/raw/RawSqlExecutor';
import { journalQueryRepository } from '@/src/data/repositories/journal/journalQueryRepository';
import { createJournalFixture, softDeleteJournalFixture } from '@/src/testing/journalFixtures';
import { AccountType, JournalStatus, TransactionType } from '@/src/types/enums';
import { AccountId, JournalId, WorkplaceId } from '@/src/types/ids';
import {
  findUnbalancedJournals,
  findUnbalancedJournalsByIds,
  type JournalBalanceAuditResult,
} from '../journalBalanceAudit';

const workplaceId = 'wp-1' as WorkplaceId;

const summarize = (result: JournalBalanceAuditResult) =>
  result.unbalanced.map(({ journal, evaluation }) => ({
    journalId: journal.journalId,
    issues: evaluation.issues.map(issue => issue.message),
  }));

describe('findUnbalancedJournals', () => {
  let cashId: AccountId;
  let equityId: AccountId;
  let eurCashId: AccountId;

  const lines = (debit: number, credit: number) => [
    { accountId: cashId, amount: debit, transactionType: TransactionType.DEBIT },
    { accountId: equityId, amount: credit, transactionType: TransactionType.CREDIT },
  ];

  beforeEach(async () => {
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });
    const create = (name: string, accountType: AccountType, currencyCode: string) =>
      accountWriteRepository.create({ name, accountType, currencyCode, workplaceId });
    cashId = (await create('Cash', AccountType.ASSET, 'USD')).id as AccountId;
    equityId = (await create('Equity', AccountType.EQUITY, 'USD')).id as AccountId;
    eurCashId = (await create('EUR Cash', AccountType.ASSET, 'EUR')).id as AccountId;
  });

  it('reports nothing when every active journal balances', async () => {
    await createJournalFixture(
      {
        description: 'Deposit',
        journalDate: 1_000,
        currencyCode: 'USD',
        transactions: lines(50, 50),
      },
      workplaceId,
    );

    await expect(findUnbalancedJournals(workplaceId)).resolves.toMatchObject({
      journalsChecked: 1,
      unbalanced: [],
    });
  });

  it('flags posted journals whose debits and credits differ', async () => {
    await createJournalFixture(
      {
        description: 'Deposit',
        journalDate: 1_000,
        currencyCode: 'USD',
        transactions: lines(50, 50),
      },
      workplaceId,
    );
    const broken = await createJournalFixture(
      {
        description: 'Legacy',
        journalDate: 2_000,
        currencyCode: 'USD',
        transactions: lines(50, 49),
      },
      workplaceId,
    );

    const result = await findUnbalancedJournals(workplaceId);

    expect(result.journalsChecked).toBe(2);
    expect(summarize(result)).toEqual([
      { journalId: broken.id, issues: ['Journal debits and credits differ by 1.00 USD'] },
    ]);
  });

  it('rechecks only the requested posted journals', async () => {
    const balanced = await createJournalFixture(
      {
        description: 'Balanced',
        journalDate: 1_000,
        currencyCode: 'USD',
        transactions: lines(50, 50),
      },
      workplaceId,
    );
    const broken = await createJournalFixture(
      {
        description: 'Legacy',
        journalDate: 2_000,
        currencyCode: 'USD',
        transactions: lines(50, 49),
      },
      workplaceId,
    );
    await createJournalFixture(
      {
        description: 'Unrequested legacy',
        journalDate: 3_000,
        currencyCode: 'USD',
        transactions: lines(50, 48),
      },
      workplaceId,
    );

    const result = await findUnbalancedJournalsByIds(workplaceId, [
      balanced.id as JournalId,
      broken.id as JournalId,
    ]);

    expect(result.journalsChecked).toBe(2);
    expect(summarize(result).map(entry => entry.journalId)).toEqual([broken.id]);
  });

  it('flags foreign-currency lines stored without an exchange rate', async () => {
    const broken = await createJournalFixture(
      {
        description: 'Imported FX',
        journalDate: 1_000,
        currencyCode: 'USD',
        transactions: [
          { accountId: eurCashId, amount: 45, transactionType: TransactionType.DEBIT },
          { accountId: equityId, amount: 50, transactionType: TransactionType.CREDIT },
        ],
      },
      workplaceId,
    );

    const result = await findUnbalancedJournals(workplaceId);

    expect(summarize(result)).toEqual([
      { journalId: broken.id, issues: [expect.stringMatching(/EUR/)] },
    ]);
  });

  it('finds the same journals when raw SQL is unavailable', async () => {
    const broken = await createJournalFixture(
      {
        description: 'Legacy',
        journalDate: 2_000,
        currencyCode: 'USD',
        transactions: lines(50, 49),
      },
      workplaceId,
    );
    jest.spyOn(rawSqlExecutor, 'query').mockResolvedValueOnce(null);

    const result = await findUnbalancedJournals(workplaceId);

    expect(summarize(result).map(entry => entry.journalId)).toEqual([broken.id]);
  });

  it('checks every journal across full and partial fallback pages', async () => {
    const brokenIds: string[] = [];
    for (let index = 0; index < 103; index++) {
      const broken = index % 25 === 0;
      const journal = await createJournalFixture(
        {
          description: `Legacy ${index}`,
          journalDate: index,
          currencyCode: 'USD',
          transactions: lines(50, broken ? 49 : 50),
        },
        workplaceId,
      );
      if (broken) brokenIds.push(journal.id);
    }
    const query = jest.spyOn(rawSqlExecutor, 'query').mockResolvedValue(null);
    try {
      const result = await findUnbalancedJournals(workplaceId);
      expect(result.journalsChecked).toBe(103);
      expect(result.unbalanced.map(entry => entry.journal.journalId).sort()).toEqual(
        brokenIds.sort(),
      );
      expect(query).toHaveBeenCalledTimes(2);
    } finally {
      query.mockRestore();
    }
  });

  it('continues past a full fallback page when an entry is reversed during loading', async () => {
    const journalIds: string[] = [];
    for (let index = 0; index < 101; index++) {
      const journal = await createJournalFixture(
        {
          description: `Legacy ${index}`,
          journalDate: index,
          currencyCode: 'USD',
          transactions: lines(50, 49),
        },
        workplaceId,
      );
      journalIds.push(journal.id);
    }
    let reversedId: string | undefined;
    const findPage = journalQueryRepository.findPostedPage.bind(journalQueryRepository);
    const pages = jest
      .spyOn(journalQueryRepository, 'findPostedPage')
      .mockImplementation(async (...args) => {
        const page = await findPage(...args);
        if (!reversedId && page.length > 0) {
          reversedId = page[0].id;
          await database.write(() =>
            page[0].update(journal => {
              journal.status = JournalStatus.REVERSED;
            }),
          );
        }
        return page;
      });
    const query = jest.spyOn(rawSqlExecutor, 'query').mockResolvedValue(null);
    try {
      const result = await findUnbalancedJournals(workplaceId);
      expect(result.journalsChecked).toBe(100);
      expect(result.unbalanced.map(entry => entry.journal.journalId).sort()).toEqual(
        journalIds.filter(id => id !== reversedId).sort(),
      );
    } finally {
      pages.mockRestore();
      query.mockRestore();
    }
  });

  it('ignores planned, reversed, and deleted journals, matching the save-time rule', async () => {
    for (const status of [JournalStatus.PLANNED, JournalStatus.REVERSED]) {
      await createJournalFixture(
        {
          description: status,
          journalDate: 1_000,
          currencyCode: 'USD',
          status,
          transactions: lines(50, 10),
        },
        workplaceId,
      );
    }
    const deleted = await createJournalFixture(
      {
        description: 'Deleted',
        journalDate: 1_000,
        currencyCode: 'USD',
        transactions: lines(50, 10),
      },
      workplaceId,
    );
    await softDeleteJournalFixture(workplaceId, deleted.id);

    await expect(findUnbalancedJournals(workplaceId)).resolves.toMatchObject({
      journalsChecked: 0,
      unbalanced: [],
    });
  });
});
