import {
  AccountSubtype,
  AccountType,
  TransactionType,
  JournalDisplayType,
  WorkplaceId,
} from '@/src/types/domain';
/**
 * Integration tests for AccountRepository
 * Tests account creation, balance calculations, and precision handling
 */

import { database } from '@/src/data/database/Database';

import { accountQueryRepository, accountWriteRepository } from '@/src/data/repositories/account';
import { journalWriteRepository } from '@/src/data/repositories/journal/journalWriteModule';
import { balanceService } from '@/src/services/balance';
import { createAccount } from '@/src/services/accounts/accountCommands';
import { deleteAccount } from '@/src/services/accounts/accountDeleteCommands';
import { applyAccountArchiveChanges } from '@/src/services/accounts/accountArchiveCommands';

describe('AccountRepository', () => {
  const workplaceId = 'test-wp-1' as WorkplaceId;

  beforeEach(async () => {
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });
  });

  describe('create', () => {
    it('should create a simple account', async () => {
      const account = await accountWriteRepository.create({
        name: 'Checking',
        accountType: AccountType.ASSET,
        currencyCode: 'USD',
        workplaceId,
      });

      expect(account.id).toBeDefined();
      expect(account.name).toBe('Checking');
      expect(account.accountType).toBe(AccountType.ASSET);
    });

    it('should default subcategory based on account type when missing', async () => {
      const account = await accountWriteRepository.create({
        name: 'Emergency Fund',
        accountType: AccountType.ASSET,
        currencyCode: 'USD',
        workplaceId,
      });

      expect(account.accountSubtype).toBe(AccountSubtype.CASH);
    });

    it('should create account with initial balance', async () => {
      const account = await createAccount(workplaceId, {
        name: 'Savings',
        accountType: AccountType.ASSET,
        currencyCode: 'USD',
        initialBalance: 1000,
        workplaceId,
      });

      const balance = await balanceService.getAccountBalance(account.id, workplaceId);
      expect(balance.balance).toBe(1000);
    });

    it('should reject invalid subcategory for account type', async () => {
      await expect(
        accountWriteRepository.create({
          name: 'Invalid Asset',
          accountType: AccountType.ASSET,
          accountSubtype: AccountSubtype.CREDIT_CARD,
          currencyCode: 'USD',
          workplaceId,
        }),
      ).rejects.toThrow('Subtype CREDIT_CARD is not valid for account type ASSET');
    });
  });

  describe('update', () => {
    it('should re-default subcategory when account type changes and current subcategory is incompatible', async () => {
      const account = await accountWriteRepository.create({
        name: 'Starter Asset',
        accountType: AccountType.ASSET,
        accountSubtype: AccountSubtype.CASH,
        currencyCode: 'USD',
        workplaceId,
      });

      const updated = await accountWriteRepository.update(
        account,
        {
          accountType: AccountType.EQUITY,
        },
        workplaceId,
      );

      expect(updated.accountType).toBe(AccountType.EQUITY);
      expect(updated.accountSubtype).toBe(AccountSubtype.OPENING_BALANCE);
    });

    it('archives primary + child via applyAccountArchiveChanges', async () => {
      const account = await accountWriteRepository.create({
        name: 'Cash',
        accountType: AccountType.ASSET,
        accountSubtype: AccountSubtype.CASH,
        currencyCode: 'USD',
        workplaceId,
        icon: 'wallet',
      });
      const child = await accountWriteRepository.create({
        name: 'Cash Sub',
        accountType: AccountType.ASSET,
        accountSubtype: AccountSubtype.CASH,
        currencyCode: 'USD',
        workplaceId,
        parentAccountId: account.id,
      });

      const applied = await applyAccountArchiveChanges(workplaceId, {
        toArchive: [account.id, child.id],
        toUnarchive: [],
      });
      expect(applied).toBe(true);

      const updated = await accountQueryRepository.find(workplaceId, account.id);
      expect(updated?.archivedAt).toBeTruthy();
      const refreshedChild = await accountQueryRepository.find(workplaceId, child.id);
      expect(refreshedChild?.archivedAt).toBeTruthy();
    });

    it('persists archivedAt as a first-class update field', async () => {
      const account = await accountWriteRepository.create({
        name: 'Vault',
        accountType: AccountType.ASSET,
        accountSubtype: AccountSubtype.CASH,
        currencyCode: 'USD',
        workplaceId,
      });
      const now = new Date('2026-08-07T22:04:32.000Z');
      const updated = await accountWriteRepository.update(
        account,
        { archivedAt: now },
        workplaceId,
      );
      expect(updated.archivedAt?.toISOString()).toBe(now.toISOString());

      await accountWriteRepository.update(updated, { archivedAt: null }, workplaceId);
      const refreshed = await accountQueryRepository.find(workplaceId, account.id);
      expect(refreshed?.archivedAt == null).toBe(true);
    });
  });

  describe('getAccountBalance', () => {
    it('should return zero for accounts with no transactions', async () => {
      const account = await accountWriteRepository.create({
        name: 'Empty',
        accountType: AccountType.ASSET,
        currencyCode: 'USD',
        workplaceId,
      });

      const balance = await balanceService.getAccountBalance(account.id, workplaceId);
      expect(balance.balance).toBe(0);
      expect(balance.transactionCount).toBe(0);
    });

    it('should calculate correct balance after multiple transactions', async () => {
      const asset = await accountWriteRepository.create({
        name: 'Cash',
        accountType: AccountType.ASSET,
        currencyCode: 'USD',
        workplaceId,
      });
      const equity = await accountWriteRepository.create({
        name: 'Equity',
        accountType: AccountType.EQUITY,
        currencyCode: 'USD',
        workplaceId,
      });

      // Deposit 1000
      await journalWriteRepository.createJournalWithTransactions(
        {
          description: 'Initial',
          journalDate: Date.now() - 2000,
          currencyCode: 'USD',
          totalAmount: 1000,
          displayType: JournalDisplayType.INCOME,
          transactions: [
            {
              accountId: asset.id,
              amount: 1000,
              transactionType: TransactionType.DEBIT,
            },
            {
              accountId: equity.id,
              amount: 1000,
              transactionType: TransactionType.CREDIT,
            },
          ],
          calculatedBalances: new Map([
            [asset.id, 1000],
            [equity.id, 1000],
          ]),
        },
        workplaceId,
      );

      // Withdraw 300
      await journalWriteRepository.createJournalWithTransactions(
        {
          description: 'Withdrawal',
          journalDate: Date.now() - 1000,
          currencyCode: 'USD',
          totalAmount: 300,
          displayType: JournalDisplayType.EXPENSE,
          transactions: [
            {
              accountId: asset.id,
              amount: 300,
              transactionType: TransactionType.CREDIT,
            },
            {
              accountId: equity.id,
              amount: 300,
              transactionType: TransactionType.DEBIT,
            },
          ],
          calculatedBalances: new Map([
            [asset.id, 700],
            [equity.id, 700],
          ]),
        },
        workplaceId,
      );

      const balance = await balanceService.getAccountBalance(asset.id, workplaceId);
      expect(balance.balance).toBe(700);
      expect(balance.transactionCount).toBeDefined();
    });

    it('should calculate point-in-time balances correctly', async () => {
      const asset = await accountWriteRepository.create({
        name: 'Cash',
        accountType: AccountType.ASSET,
        currencyCode: 'USD',
        workplaceId,
      });
      const equity = await accountWriteRepository.create({
        name: 'Equity',
        accountType: AccountType.EQUITY,
        currencyCode: 'USD',
        workplaceId,
      });

      const earlierTime = Date.now() - 5000;
      const laterTime = Date.now();

      await journalWriteRepository.createJournalWithTransactions(
        {
          description: 'Earlier',
          journalDate: earlierTime,
          currencyCode: 'USD',
          totalAmount: 500,
          displayType: JournalDisplayType.INCOME,
          transactions: [
            {
              accountId: asset.id,
              amount: 500,
              transactionType: TransactionType.DEBIT,
            },
            {
              accountId: equity.id,
              amount: 500,
              transactionType: TransactionType.CREDIT,
            },
          ],
          calculatedBalances: new Map([
            [asset.id, 500],
            [equity.id, 500],
          ]),
        },
        workplaceId,
      );

      await journalWriteRepository.createJournalWithTransactions(
        {
          description: 'Later',
          journalDate: laterTime,
          currencyCode: 'USD',
          totalAmount: 200,
          displayType: JournalDisplayType.INCOME,
          transactions: [
            {
              accountId: asset.id,
              amount: 200,
              transactionType: TransactionType.DEBIT,
            },
            {
              accountId: equity.id,
              amount: 200,
              transactionType: TransactionType.CREDIT,
            },
          ],
          calculatedBalances: new Map([
            [asset.id, 700],
            [equity.id, 700],
          ]),
        },
        workplaceId,
      );

      // Balance at earlier point
      const earlierBalance = await balanceService.getAccountBalance(
        asset.id,
        workplaceId,
        earlierTime + 1,
      );
      expect(earlierBalance.balance).toBe(500);

      // Current balance
      const currentBalance = await balanceService.getAccountBalance(asset.id, workplaceId);
      expect(currentBalance.balance).toBe(700);
    });
  });

  describe('deleteAccount', () => {
    it('should reject deleting an account that has transactions', async () => {
      const asset = await accountWriteRepository.create({
        name: 'Cash',
        accountType: AccountType.ASSET,
        currencyCode: 'USD',
        workplaceId,
      });
      const equity = await accountWriteRepository.create({
        name: 'Equity',
        accountType: AccountType.EQUITY,
        currencyCode: 'USD',
        workplaceId,
      });

      await journalWriteRepository.createJournalWithTransactions(
        {
          description: 'Deposit',
          journalDate: Date.now(),
          currencyCode: 'USD',
          totalAmount: 100,
          displayType: JournalDisplayType.INCOME,
          transactions: [
            {
              accountId: asset.id,
              amount: 100,
              transactionType: TransactionType.DEBIT,
            },
            {
              accountId: equity.id,
              amount: 100,
              transactionType: TransactionType.CREDIT,
            },
          ],
          calculatedBalances: new Map([
            [asset.id, 100],
            [equity.id, 100],
          ]),
        },
        workplaceId,
      );

      await expect(deleteAccount(asset.id, workplaceId)).rejects.toThrow(
        'cannot be deleted while referenced by 1 transaction(s)',
      );

      const stillThere = await accountQueryRepository.find(workplaceId, asset.id);
      expect(stillThere).not.toBeNull();
    });

    it('should soft-delete an account with no transactions', async () => {
      const account = await accountWriteRepository.create({
        name: 'Unused',
        accountType: AccountType.ASSET,
        currencyCode: 'USD',
        workplaceId,
      });

      await deleteAccount(account.id, workplaceId);

      const found = await accountQueryRepository.find(workplaceId, account.id);
      expect(found).toBeNull();
    });
  });

  describe('findByType', () => {
    it('should filter accounts by type', async () => {
      await accountWriteRepository.create({
        name: 'Cash',
        accountType: AccountType.ASSET,
        currencyCode: 'USD',
        workplaceId,
      });
      await accountWriteRepository.create({
        name: 'Card',
        accountType: AccountType.LIABILITY,
        currencyCode: 'USD',
        workplaceId,
      });
      await accountWriteRepository.create({
        name: 'Bank',
        accountType: AccountType.ASSET,
        currencyCode: 'USD',
        workplaceId,
      });

      const assets = await accountQueryRepository.findByType(workplaceId, AccountType.ASSET);
      expect(assets.length).toBe(2);
      expect(assets.every(a => a.accountType === AccountType.ASSET)).toBe(true);
    });
  });
});
