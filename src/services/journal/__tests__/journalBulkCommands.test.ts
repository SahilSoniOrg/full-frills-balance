import { database } from '@/src/data/database/Database';
import Journal from '@/src/data/models/Journal';
import Transaction from '@/src/data/models/Transaction';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import {
  analyzeJournalsForMerge,
  bulkChangeJournalAccount,
  bulkDeleteJournals,
  bulkDuplicateJournals,
  bulkRenameJournals,
  checkJournalAccountEditEligibility,
  mergeJournals,
  undoBulkChangeJournalAccount,
} from '@/src/services/journal/journalBulkCommands';
import { ledgerWriteService } from '@/src/services/ledger';
import {
  AccountId,
  AccountType,
  JournalDisplayType,
  JournalId,
  TransactionType,
  WorkplaceId,
} from '@/src/types/domain';
import { Q } from '@nozbe/watermelondb';

const WP = 'wp-bulk-cmd' as WorkplaceId;

describe('journalBulkCommands', () => {
  let assetAccId: AccountId;
  let expenseAccId: AccountId;
  let newExpenseAccId: AccountId;

  beforeEach(async () => {
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });

    const assetAcc = await accountRepository.create({
      workplaceId: WP,
      name: 'Checking',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
    });
    assetAccId = assetAcc.id;

    const expAcc = await accountRepository.create({
      workplaceId: WP,
      name: 'Food',
      accountType: AccountType.EXPENSE,
      currencyCode: 'USD',
    });
    expenseAccId = expAcc.id;

    const newExpAcc = await accountRepository.create({
      workplaceId: WP,
      name: 'Travel',
      accountType: AccountType.EXPENSE,
      currencyCode: 'USD',
    });
    newExpenseAccId = newExpAcc.id;
  });

  it('bulkRenameJournals updates descriptions and supports undo', async () => {
    const j1 = await ledgerWriteService.createJournal(
      {
        journalDate: Date.now(),
        description: 'Original 1',
        currencyCode: 'USD',
        transactions: [
          { accountId: expenseAccId, amount: 20, transactionType: TransactionType.DEBIT },
          { accountId: assetAccId, amount: 20, transactionType: TransactionType.CREDIT },
        ],
      },
      WP,
    );

    const j2 = await ledgerWriteService.createJournal(
      {
        journalDate: Date.now(),
        description: 'Original 2',
        currencyCode: 'USD',
        transactions: [
          { accountId: expenseAccId, amount: 30, transactionType: TransactionType.DEBIT },
          { accountId: assetAccId, amount: 30, transactionType: TransactionType.CREDIT },
        ],
      },
      WP,
    );

    const { renamedCount, inverseRenames } = await bulkRenameJournals(WP, {
      [j1.id as JournalId]: 'Renamed 1',
      [j2.id as JournalId]: 'Renamed 2',
    });

    expect(renamedCount).toBe(2);

    let reloaded1 = await database.collections.get<Journal>('journals').find(j1.id);
    let reloaded2 = await database.collections.get<Journal>('journals').find(j2.id);

    expect(reloaded1.description).toBe('Renamed 1');
    expect(reloaded2.description).toBe('Renamed 2');

    // Test Undo
    await bulkRenameJournals(WP, inverseRenames);
    reloaded1 = await database.collections.get<Journal>('journals').find(j1.id);
    reloaded2 = await database.collections.get<Journal>('journals').find(j2.id);
    expect(reloaded1.description).toBe('Original 1');
    expect(reloaded2.description).toBe('Original 2');
  });

  it('bulkDuplicateJournals creates new clone entries in an atomic batch', async () => {
    const j1 = await ledgerWriteService.createJournal(
      {
        journalDate: Date.now(),
        description: 'To Clone',
        currencyCode: 'USD',
        transactions: [
          { accountId: expenseAccId, amount: 50, transactionType: TransactionType.DEBIT },
          { accountId: assetAccId, amount: 50, transactionType: TransactionType.CREDIT },
        ],
      },
      WP,
    );

    const duplicates = await bulkDuplicateJournals(WP, [j1.id as JournalId]);
    expect(duplicates.length).toBe(1);
    expect(duplicates[0].id).not.toBe(j1.id);
    expect(duplicates[0].description).toBe('To Clone');
    expect(duplicates[0].totalAmount).toBe(50);
  });

  it('analyzeJournalsForMerge computes preview correctly and enforces balance invariants', async () => {
    const j1 = await ledgerWriteService.createJournal(
      {
        journalDate: 1000,
        description: 'Coffee',
        currencyCode: 'USD',
        transactions: [
          { accountId: expenseAccId, amount: 15, transactionType: TransactionType.DEBIT },
          { accountId: assetAccId, amount: 15, transactionType: TransactionType.CREDIT },
        ],
      },
      WP,
    );

    const j2 = await ledgerWriteService.createJournal(
      {
        journalDate: 2000,
        description: 'Snacks',
        currencyCode: 'USD',
        transactions: [
          { accountId: expenseAccId, amount: 25, transactionType: TransactionType.DEBIT },
          { accountId: assetAccId, amount: 25, transactionType: TransactionType.CREDIT },
        ],
      },
      WP,
    );

    const preview = await analyzeJournalsForMerge(WP, [j1.id as JournalId, j2.id as JournalId]);
    expect(preview.canMerge).toBe(true);
    expect(preview.totalDebit).toBe(40);
    expect(preview.totalCredit).toBe(40);
    expect(preview.combinedDescription).toBe('Merged: Coffee, Snacks');
    expect(preview.suggestedDate).toBe(2000);
    expect(preview.suggestedDisplayType).toBe(JournalDisplayType.EXPENSE);
    expect(preview.combinedLines.length).toBe(2);
  });

  it('mergeJournals atomically creates combined entry and soft-deletes originals', async () => {
    const j1 = await ledgerWriteService.createJournal(
      {
        journalDate: 1000,
        description: 'Part 1',
        currencyCode: 'USD',
        transactions: [
          { accountId: expenseAccId, amount: 10, transactionType: TransactionType.DEBIT },
          { accountId: assetAccId, amount: 10, transactionType: TransactionType.CREDIT },
        ],
      },
      WP,
    );

    const j2 = await ledgerWriteService.createJournal(
      {
        journalDate: 2000,
        description: 'Part 2',
        currencyCode: 'USD',
        transactions: [
          { accountId: expenseAccId, amount: 20, transactionType: TransactionType.DEBIT },
          { accountId: assetAccId, amount: 20, transactionType: TransactionType.CREDIT },
        ],
      },
      WP,
    );

    const merged = await mergeJournals(WP, [j1.id as JournalId, j2.id as JournalId], {
      description: 'Custom Merged Name',
    });

    expect(merged.description).toBe('Custom Merged Name');
    expect(merged.totalAmount).toBe(30);
    expect(merged.displayType).toBe(JournalDisplayType.EXPENSE);

    // Verify source journals are soft deleted
    const reloaded1 = await database.collections.get<Journal>('journals').find(j1.id);
    const reloaded2 = await database.collections.get<Journal>('journals').find(j2.id);
    expect(reloaded1.deletedAt).toBeTruthy();
    expect(reloaded2.deletedAt).toBeTruthy();
  });

  it('checkJournalAccountEditEligibility validates single debit / credit rules', async () => {
    const singleDebitSingleCredit = await ledgerWriteService.createJournal(
      {
        journalDate: Date.now(),
        description: 'Simple',
        currencyCode: 'USD',
        transactions: [
          { accountId: expenseAccId, amount: 10, transactionType: TransactionType.DEBIT },
          { accountId: assetAccId, amount: 10, transactionType: TransactionType.CREDIT },
        ],
      },
      WP,
    );

    const eligibility = await checkJournalAccountEditEligibility(WP, [
      singleDebitSingleCredit.id as JournalId,
    ]);
    expect(eligibility.canEditDebit).toBe(true);
    expect(eligibility.canEditCredit).toBe(true);
    expect(eligibility.debitAccounts).toEqual([expenseAccId]);
    expect(eligibility.creditAccounts).toEqual([assetAccId]);
  });

  it('bulkChangeJournalAccount updates destination leg and supports undo', async () => {
    const j1 = await ledgerWriteService.createJournal(
      {
        journalDate: Date.now(),
        description: 'Entry 1',
        currencyCode: 'USD',
        transactions: [
          { accountId: expenseAccId, amount: 15, transactionType: TransactionType.DEBIT },
          { accountId: assetAccId, amount: 15, transactionType: TransactionType.CREDIT },
        ],
      },
      WP,
    );

    const { updatedCount, originalAccountIdByTransactionId } = await bulkChangeJournalAccount(
      WP,
      [j1.id as JournalId],
      'debit',
      newExpenseAccId,
    );

    expect(updatedCount).toBe(1);

    let txs = await database.collections
      .get<Transaction>('transactions')
      .query(Q.where('journal_id', j1.id), Q.where('transaction_type', TransactionType.DEBIT))
      .fetch();

    expect(txs[0].accountId).toBe(newExpenseAccId);

    // Test Undo
    await undoBulkChangeJournalAccount(WP, originalAccountIdByTransactionId);

    txs = await database.collections
      .get<Transaction>('transactions')
      .query(Q.where('journal_id', j1.id), Q.where('transaction_type', TransactionType.DEBIT))
      .fetch();

    expect(txs[0].accountId).toBe(expenseAccId);
  });

  it('bulkDeleteJournals soft deletes journals and transactions in an atomic batch', async () => {
    const j1 = await ledgerWriteService.createJournal(
      {
        journalDate: Date.now(),
        description: 'To Delete',
        currencyCode: 'USD',
        transactions: [
          { accountId: expenseAccId, amount: 100, transactionType: TransactionType.DEBIT },
          { accountId: assetAccId, amount: 100, transactionType: TransactionType.CREDIT },
        ],
      },
      WP,
    );

    await bulkDeleteJournals(WP, [j1.id as JournalId]);

    const reloaded = await database.collections.get<Journal>('journals').find(j1.id);
    expect(reloaded.deletedAt).toBeTruthy();

    const txs = await database.collections
      .get<Transaction>('transactions')
      .query(Q.where('journal_id', j1.id), Q.where('deleted_at', Q.eq(null)))
      .fetch();
    expect(txs.length).toBe(0);
  });
});
