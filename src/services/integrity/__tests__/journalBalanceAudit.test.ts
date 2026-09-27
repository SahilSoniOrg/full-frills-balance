import { database } from '@/src/data/database/Database';
import { accountWriteRepository } from '@/src/data/repositories/account';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { createJournalFixture, softDeleteJournalFixture } from '@/src/testing/journalFixtures';
import { AccountType, JournalStatus, TransactionType } from '@/src/types/enums';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { findUnbalancedJournals, type JournalBalanceAuditResult } from '../journalBalanceAudit';

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
    jest.spyOn(transactionRawRepository, 'queryRaw').mockResolvedValueOnce(null);

    const result = await findUnbalancedJournals(workplaceId);

    expect(summarize(result).map(entry => entry.journalId)).toEqual([broken.id]);
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
