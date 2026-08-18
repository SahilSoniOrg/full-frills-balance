import {
  AccountSubtype,
  AccountType,
  TransactionType,
  AccountId,
  JournalDisplayType,
  WorkplaceId,
} from '@/src/types/domain';
/**
 * Account command lifecycle (integration).
 */

import { database } from '@/src/data/database/Database';

import { AuditAction } from '@/src/data/models/AuditLog';

import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import { journalWriteRepository } from '@/src/data/repositories/journal/journalWriteModule';
import { journalListQueryRepository } from '@/src/data/repositories/journal/journalTimelineModule';
import { adjustAccountBalance } from '@/src/services/accounts/accountAdjustCommands';
import { applyAccountArchiveChanges } from '@/src/services/accounts/accountArchiveCommands';
import { createAccount } from '@/src/services/accounts/accountCommands';
import { mergeAccounts } from '@/src/services/accounts/accountMergeCommands';
import { reconcileAccount } from '@/src/services/accounts/accountReconcileCommands';
import { balanceService } from '@/src/services/BalanceService';

const WP = 'wp-acct-cmd' as WorkplaceId;

describe('account commands (integration)', () => {
  beforeEach(async () => {
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });
  }, 15000);

  it('create persists account, audit log, and initial balance journal', async () => {
    const created = await createAccount(WP, {
      name: 'Checking',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      initialBalance: 500,
      workplaceId: WP,
    });

    expect(created.name).toBe('Checking');
    expect(created.accountSubtype).toBe(AccountSubtype.CASH);

    const balance = await balanceService.getAccountBalance(created.id, WP);
    expect(balance.balance).toBe(500);

    const audits = await auditRepository.findByEntity('account', created.id, WP);
    expect(audits.some(a => a.action === AuditAction.CREATE)).toBe(true);

    const journals = await journalListQueryRepository.findAll(WP);
    expect(journals.some(j => j.description?.includes('Initial Balance'))).toBe(true);
  });

  it('create with opening balance uses one write', async () => {
    const writeSpy = jest.spyOn(database, 'write');
    await createAccount(WP, {
      name: 'Checking',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      initialBalance: 500,
      workplaceId: WP,
    });
    expect(writeSpy).toHaveBeenCalledTimes(1);
    writeSpy.mockRestore();
  });

  it('create stores metadata on the account', async () => {
    const created = await createAccount(WP, {
      name: 'Rewards Card',
      accountType: AccountType.LIABILITY,
      accountSubtype: AccountSubtype.CREDIT_CARD,
      currencyCode: 'USD',
      workplaceId: WP,
      metadata: { creditLimitAmount: 10_000, statementDay: 15 },
    });

    const meta = await accountRepository.findMetadata(WP, created.id as AccountId);
    expect(meta?.creditLimitAmount).toBe(10_000);
    expect(meta?.statementDay).toBe(15);
  });

  it('create rejects parent with mismatched type', async () => {
    const expenseParent = await createAccount(WP, {
      name: 'Food',
      accountType: AccountType.EXPENSE,
      currencyCode: 'USD',
      workplaceId: WP,
    });

    await expect(
      createAccount(WP, {
        name: 'Nested',
        accountType: AccountType.ASSET,
        currencyCode: 'USD',
        parentAccountId: expenseParent.id as AccountId,
        workplaceId: WP,
      }),
    ).rejects.toThrow('Parent account must be of the same type');
  });

  it('adjustBalance posts correction journal to reach target', async () => {
    const asset = await createAccount(WP, {
      name: 'Cash',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WP,
    });
    const equity = await accountRepository.create({
      name: 'Equity',
      accountType: AccountType.EQUITY,
      currencyCode: 'USD',
      workplaceId: WP,
    });

    await journalWriteRepository.createJournalWithTransactions(
      {
        description: 'Seed',
        journalDate: Date.now(),
        currencyCode: 'USD',
        totalAmount: 100,
        displayType: JournalDisplayType.INCOME,
        transactions: [
          {
            accountId: asset.id as AccountId,
            amount: 100,
            transactionType: TransactionType.DEBIT,
          },
          {
            accountId: equity.id as AccountId,
            amount: 100,
            transactionType: TransactionType.CREDIT,
          },
        ],
        calculatedBalances: new Map([
          [asset.id, 100],
          [equity.id, 100],
        ]),
      },
      WP,
    );

    await adjustAccountBalance(WP, asset, 250);
    const balance = await balanceService.getAccountBalance(asset.id, WP);
    expect(balance.balance).toBe(250);
  });

  it('adjustBalance can pair with an income category counterparty', async () => {
    const asset = await createAccount(WP, {
      name: 'Wallet',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WP,
    });
    const income = await createAccount(WP, {
      name: 'Salary',
      accountType: AccountType.INCOME,
      currencyCode: 'USD',
      workplaceId: WP,
    });

    await adjustAccountBalance(WP, asset, 75, {
      kind: 'account',
      accountId: income.id as AccountId,
    });

    const balance = await balanceService.getAccountBalance(asset.id, WP);
    expect(balance.balance).toBe(75);
  });

  it('reconcileAccount sets reconciledAt and audits update', async () => {
    const account = await createAccount(WP, {
      name: 'Reconcilable',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WP,
    });

    const reconcileDate = new Date(2026, 0, 31);
    const updated = await reconcileAccount(account.id as AccountId, reconcileDate, WP);

    expect(updated.reconciledAt?.getTime()).toBe(reconcileDate.getTime());

    const audits = await auditRepository.findByEntity('account', account.id, WP);
    expect(audits.some(a => a.action === AuditAction.UPDATE)).toBe(true);
  });

  it('mergeAccounts rejects incompatible account types', async () => {
    const asset = await createAccount(WP, {
      name: 'Asset',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WP,
    });
    const expense = await createAccount(WP, {
      name: 'Expense',
      accountType: AccountType.EXPENSE,
      currencyCode: 'USD',
      workplaceId: WP,
    });

    await expect(
      mergeAccounts(WP, asset.id as AccountId, [expense.id as AccountId]),
    ).rejects.toThrow('different categories');
  });

  it('applyAccountArchiveChanges archives primary + child in one write', async () => {
    const parent = await createAccount(WP, {
      name: 'Cash',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WP,
      icon: 'wallet',
    });
    const child = await createAccount(WP, {
      name: 'Cash Sub',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WP,
      parentAccountId: parent.id as AccountId,
      icon: 'wallet',
    });

    const applied = await applyAccountArchiveChanges(WP, {
      toArchive: [parent.id as AccountId, child.id as AccountId],
      toUnarchive: [],
    });

    expect(applied).toBe(true);
    const updated = await accountRepository.find(WP, parent.id as AccountId);
    expect(updated?.archivedAt).toBeTruthy();
    const refreshedChild = await accountRepository.find(WP, child.id as AccountId);
    expect(refreshedChild?.archivedAt).toBeTruthy();
  });
});
