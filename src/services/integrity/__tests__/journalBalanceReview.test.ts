import { database } from '@/src/data/database/Database';
import type Transaction from '@/src/data/models/Transaction';
import { accountWriteRepository } from '@/src/data/repositories/account';
import { Q } from '@nozbe/watermelondb';
import { createJournalFixture } from '@/src/testing/journalFixtures';
import { AccountType, TransactionType } from '@/src/types/enums';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { findUnbalancedJournals } from '../journalBalanceAudit';
import {
  applyJournalBalanceFxSuggestions,
  loadJournalBalanceReview,
  saveJournalBalanceEdits,
} from '../journalBalanceReview';

const workplaceId = 'wp-review' as WorkplaceId;

describe('journal balance review', () => {
  let cashId: AccountId;
  let equityId: AccountId;
  let eurCashId: AccountId;

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

  const createMissingRateJournal = () =>
    createJournalFixture(
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

  const createShortJournal = () =>
    createJournalFixture(
      {
        description: 'Short',
        journalDate: 2_000,
        currencyCode: 'USD',
        transactions: [
          { accountId: cashId, amount: 50, transactionType: TransactionType.DEBIT },
          { accountId: equityId, amount: 49, transactionType: TransactionType.CREDIT },
        ],
      },
      workplaceId,
    );

  it('loads each unbalanced journal with its lines and any implied FX rate', async () => {
    const fx = await createMissingRateJournal();
    const short = await createShortJournal();

    const entries = await loadJournalBalanceReview(workplaceId, 'review');

    expect(entries.map(entry => entry.journalId)).toEqual([short.id, fx.id]);
    const fxEntry = entries.find(entry => entry.journalId === fx.id);
    expect(fxEntry?.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ accountName: 'EUR Cash', currency: 'EUR', amount: 45 }),
      ]),
    );
    expect(fxEntry?.fxProposal?.exchangeRate).toBeCloseTo(50 / 45);
    expect(entries.find(entry => entry.journalId === short.id)?.fxProposal).toBeUndefined();
  });

  it('applies implied FX rates without changing account amounts', async () => {
    const fx = await createMissingRateJournal();

    await expect(applyJournalBalanceFxSuggestions(workplaceId, [fx.id])).resolves.toBe(1);

    await expect(findUnbalancedJournals(workplaceId)).resolves.toMatchObject({ unbalanced: [] });
    const eurLines = await database.collections
      .get<Transaction>('transactions')
      .query(Q.where('account_id', eurCashId), Q.where('deleted_at', null))
      .fetch();
    expect(eurLines).toHaveLength(1);
    expect(eurLines[0]?.amount).toBe(45);
    expect(eurLines[0]?.exchangeRate).toBeCloseTo(50 / 45);
  });

  it('saves edits that balance the journal and rejects edits that do not', async () => {
    const short = await createShortJournal();
    const [entry] = await loadJournalBalanceReview(workplaceId, 'review');
    const edits = (credit: string) =>
      entry!.lines.map(line => ({
        transactionId: line.id,
        amount: line.transactionType === TransactionType.CREDIT ? credit : String(line.amount),
      }));

    await expect(saveJournalBalanceEdits(workplaceId, short.id, edits('48'))).rejects.toThrow(
      /differ by 2.00 USD/,
    );
    await saveJournalBalanceEdits(workplaceId, short.id, edits('50'));

    await expect(loadJournalBalanceReview(workplaceId, 'review')).resolves.toEqual([]);
  });
});
