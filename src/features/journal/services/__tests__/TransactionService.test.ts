import { database } from '@/src/data/database/Database';
import { AccountType } from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { ledgerWriteService } from '@/src/services/ledger';
import { transactionService } from '@/src/services/transaction-ingestion';
import { AccountId, JournalId, WorkplaceId } from '@/src/types/domain';

describe('TransactionService', () => {
  let accountId: string;
  let equityAccountId: string;
  let expenseAccountId: string;

  beforeEach(async () => {
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });
    const account = await accountRepository.create({
      name: 'Test Account',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: 'wp-1' as WorkplaceId,
    });
    accountId = account.id;

    const equity = await accountRepository.create({
      name: 'Equity',
      accountType: AccountType.EQUITY,
      currencyCode: 'USD',
      workplaceId: 'wp-1' as WorkplaceId,
    });
    equityAccountId = equity.id;

    const expense = await accountRepository.create({
      name: 'Expense',
      accountType: AccountType.EXPENSE,
      currencyCode: 'USD',
      workplaceId: 'wp-1' as WorkplaceId,
    });
    expenseAccountId = expense.id;
  });

  describe('getTransactionsWithAccountInfo', () => {
    it('should return transactions with joined account info', async () => {
      const journal = await ledgerWriteService.createJournal(
        {
          description: 'Test Journal',
          journalDate: Date.now(),
          currencyCode: 'USD',
          transactions: [
            {
              accountId: accountId as AccountId,
              amount: 100,
              transactionType: TransactionType.DEBIT,
            },
            {
              accountId: equityAccountId as AccountId,
              amount: 100,
              transactionType: TransactionType.CREDIT,
            },
          ],
        },
        'wp-1' as WorkplaceId,
      );

      const transactions = await transactionService.getTransactionsWithAccountInfo(
        'wp-1' as WorkplaceId,
        journal.id as JournalId,
      );

      expect(transactions).toHaveLength(2);

      // Check first transaction (Debit Asset)
      const tx1 = transactions.find(t => t.accountId === (accountId as AccountId));
      expect(tx1).toBeDefined();
      expect(tx1?.accountName).toBe('Test Account');
      expect(tx1?.accountType).toBe(AccountType.ASSET);
      expect(tx1?.balanceImpact).toBe('INCREASE'); // Debit Asset = Increase

      // Check second transaction (Credit Equity)
      const tx2 = transactions.find(t => t.accountId === (equityAccountId as AccountId));
      expect(tx2).toBeDefined();
      expect(tx2?.accountName).toBe('Equity');
      expect(tx2?.accountType).toBe(AccountType.EQUITY);
      expect(tx2?.balanceImpact).toBe('INCREASE'); // Credit Equity = Increase
    });
  });

  describe('getEnrichedByJournal', () => {
    it('assigns a single counterparty in counterAccounts for two-leg journals', async () => {
      const journal = await ledgerWriteService.createJournal(
        {
          description: 'Simple Transfer',
          journalDate: Date.now(),
          currencyCode: 'USD',
          transactions: [
            {
              accountId: accountId as AccountId,
              amount: 50,
              transactionType: TransactionType.DEBIT,
            },
            {
              accountId: equityAccountId as AccountId,
              amount: 50,
              transactionType: TransactionType.CREDIT,
            },
          ],
        },
        'wp-1' as WorkplaceId,
      );

      const enriched = await transactionService.getEnrichedByJournal(
        'wp-1' as WorkplaceId,
        journal.id as JournalId,
      );

      const assetTx = enriched.find(t => t.accountId === (accountId as AccountId));
      expect(assetTx?.counterAccounts).toHaveLength(1);
      expect(assetTx?.counterAccounts?.[0].name).toBe('Equity');
      expect(assetTx?.counterAccounts?.[0].id).toBe(equityAccountId);
    });

    it('assigns all counterparties for multi-line journals', async () => {
      const journal = await ledgerWriteService.createJournal(
        {
          description: 'Split Transaction',
          journalDate: Date.now(),
          currencyCode: 'USD',
          transactions: [
            {
              accountId: accountId as AccountId,
              amount: 100,
              transactionType: TransactionType.DEBIT,
            },
            {
              accountId: equityAccountId as AccountId,
              amount: 60,
              transactionType: TransactionType.CREDIT,
            },
            {
              accountId: expenseAccountId as AccountId,
              amount: 40,
              transactionType: TransactionType.CREDIT,
            },
          ],
        },
        'wp-1' as WorkplaceId,
      );

      const enriched = await transactionService.getEnrichedByJournal(
        'wp-1' as WorkplaceId,
        journal.id as JournalId,
      );

      expect(enriched).toHaveLength(3);
      const assetTx = enriched.find(t => t.accountId === (accountId as AccountId));
      expect(assetTx?.counterAccounts).toHaveLength(2);

      const equityTx = enriched.find(t => t.accountId === (equityAccountId as AccountId));
      expect(equityTx?.counterAccounts).toHaveLength(2);
    });
  });
});
