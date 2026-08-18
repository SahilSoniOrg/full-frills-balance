import { database } from '@/src/data/database/Database';
import { AccountType, TransactionType, WorkplaceId } from '@/src/types/domain';

import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import { balanceService } from '@/src/services/BalanceService';
import { ledgerWriteService } from '@/src/services/ledger';
import { createAccount } from '@/src/services/accounts/accountCommands';
import { updateAccount } from '@/src/services/accounts/accountHierarchyCommands';

describe('Account Hierarchy Integration', () => {
  const workplaceId = 'test-wp-1' as WorkplaceId;

  beforeEach(async () => {
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });
    await workplaceRepository.create({
      id: workplaceId,
      name: 'Test Workplace',
      icon: 'briefcase',
      defaultCurrencyCode: 'USD',
    });
  });

  it('should create a parent and child account correctly', async () => {
    const parent = await createAccount(workplaceId, {
      name: 'Parent Asset',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      icon: 'bank',
      workplaceId,
    });

    const child = await createAccount(workplaceId, {
      name: 'Child Asset',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      icon: 'wallet',
      parentAccountId: parent.id,
      workplaceId,
    });

    expect(child.parentAccountId).toBe(parent.id);

    const subAccounts = await parent.subAccounts.fetch();
    expect(subAccounts.length).toBe(1);
    expect(subAccounts[0].id).toBe(child.id);
  });

  it('should aggregate balances from child to parent', async () => {
    const parent = await createAccount(workplaceId, {
      name: 'Parent',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId,
    });

    const child = await createAccount(workplaceId, {
      name: 'Child',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      parentAccountId: parent.id,
      initialBalance: 100,
      workplaceId,
    });

    const other = await createAccount(workplaceId, {
      name: 'Other',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId,
    });

    await ledgerWriteService.createJournal(
      {
        journalDate: Date.now(),
        description: 'Child Tx',
        currencyCode: 'USD',
        transactions: [
          {
            accountId: child.id,
            amount: 50,
            transactionType: TransactionType.DEBIT,
          },
          {
            accountId: other.id,
            amount: 50,
            transactionType: TransactionType.CREDIT,
          },
        ],
      },
      workplaceId,
    );

    const balances = await balanceService.getAccountBalances(workplaceId);
    const parentBalance = balances.find(b => b.accountId === parent.id);
    const childBalance = balances.find(b => b.accountId === child.id);

    expect(childBalance?.balance).toBe(150); // 100 + 50
    expect(parentBalance?.balance).toBe(150); // Aggregated from child
  });

  it('should handle multi-level aggregation (A -> B -> C)', async () => {
    const a = await createAccount(workplaceId, {
      name: 'A',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId,
    });
    const b = await createAccount(workplaceId, {
      name: 'B',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      parentAccountId: a.id,
      workplaceId,
    });
    const c = await createAccount(workplaceId, {
      name: 'C',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      parentAccountId: b.id,
      workplaceId,
    });

    const other = await createAccount(workplaceId, {
      name: 'Other',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId,
    });

    await ledgerWriteService.createJournal(
      {
        journalDate: Date.now(),
        description: 'C Tx',
        currencyCode: 'USD',
        transactions: [
          {
            accountId: c.id,
            amount: 10,
            transactionType: TransactionType.DEBIT,
          },
          {
            accountId: other.id,
            amount: 10,
            transactionType: TransactionType.CREDIT,
          },
        ],
      },
      workplaceId,
    );

    const balances = await balanceService.getAccountBalances(workplaceId);
    const balanceA = balances.find(bl => bl.accountId === a.id);
    const balanceB = balances.find(bl => bl.accountId === b.id);
    const balanceC = balances.find(bl => bl.accountId === c.id);

    expect(balanceC?.balance).toBe(10);
    expect(balanceB?.balance).toBe(10);
    expect(balanceA?.balance).toBe(10);
  });

  it('should prevent circular dependencies (A -> B -> A)', async () => {
    const a = await createAccount(workplaceId, {
      name: 'A',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId,
    });
    const b = await createAccount(workplaceId, {
      name: 'B',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      parentAccountId: a.id,
      workplaceId,
    });

    // Attempting to set A's parent to B should fail
    await expect(updateAccount(workplaceId, a.id, { parentAccountId: b.id })).rejects.toThrow(
      'Circular parent relationship detected',
    );
  });

  it('should prevent parenting between different account types', async () => {
    await createAccount(workplaceId, {
      name: 'Asset',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId,
    });
    const liability = await createAccount(workplaceId, {
      name: 'Liability',
      accountType: AccountType.LIABILITY,
      currencyCode: 'USD',
      workplaceId,
    });

    await expect(
      createAccount(workplaceId, {
        name: 'Child',
        accountType: AccountType.ASSET,
        currencyCode: 'USD',
        parentAccountId: liability.id,
        workplaceId,
      }),
    ).rejects.toThrow('Parent account must be of the same type');
  });

  it('should prevent an account with transactions from becoming a parent', async () => {
    const parent = await createAccount(workplaceId, {
      name: 'Parent with Tx',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      initialBalance: 100, // This creates a transaction
      workplaceId,
    });

    const child = await createAccount(workplaceId, {
      name: 'Child',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId,
    });

    // Attempting to set 'parent' as child's parent should fail because it has an initial balance transaction
    await expect(
      updateAccount(workplaceId, child.id, { parentAccountId: parent.id }),
    ).rejects.toThrow(/has transactions and cannot be used as a parent/);
  });

  it('should prevent creating an account with a parent that has transactions', async () => {
    const other = await createAccount(workplaceId, {
      name: 'Other',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId,
    });
    const nonEmptyAccount = await createAccount(workplaceId, {
      name: 'Non Empty',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId,
    });

    // Add a transaction
    await ledgerWriteService.createJournal(
      {
        journalDate: Date.now(),
        description: 'Tx',
        currencyCode: 'USD',
        transactions: [
          {
            accountId: nonEmptyAccount.id,
            amount: 10,
            transactionType: TransactionType.DEBIT,
          },
          { accountId: other.id, amount: 10, transactionType: TransactionType.CREDIT },
        ],
      },
      workplaceId,
    );

    await expect(
      createAccount(workplaceId, {
        name: 'New Child',
        accountType: AccountType.ASSET,
        currencyCode: 'USD',
        parentAccountId: nonEmptyAccount.id,
        workplaceId,
      }),
    ).rejects.toThrow(/has transactions and cannot be used as a parent/);
  });

  it('should not clear account name when updating only parentAccountId', async () => {
    const parent = await createAccount(workplaceId, {
      name: 'Parent',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId,
    });

    const child = await createAccount(workplaceId, {
      name: 'Original Child Name',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      description: 'Original Description',
      workplaceId,
    });

    // Update ONLY parentAccountId
    const updated = await updateAccount(workplaceId, child.id, { parentAccountId: parent.id });

    // Verify name and description are preserved
    expect(updated.name).toBe('Original Child Name');
    expect(updated.description).toBe('Original Description');
    expect(updated.parentAccountId).toBe(parent.id);

    // Move back to top level (clear parent)
    const cleared = await updateAccount(workplaceId, child.id, { parentAccountId: null });
    expect(cleared.name).toBe('Original Child Name');
    expect(cleared.parentAccountId).toBeFalsy();
  });

  it('should prevent changing account type if account has sub-accounts', async () => {
    const parent = await createAccount(workplaceId, {
      name: 'Parent Category',
      accountType: AccountType.EXPENSE,
      currencyCode: 'USD',
      workplaceId,
    });

    await createAccount(workplaceId, {
      name: 'Child Category',
      accountType: AccountType.EXPENSE,
      currencyCode: 'USD',
      parentAccountId: parent.id,
      workplaceId,
    });

    await expect(
      updateAccount(workplaceId, parent.id, { accountType: AccountType.ASSET }),
    ).rejects.toThrow('Cannot change category or type of an account that has sub-accounts.');
  });

  it('should prevent changing child account type to mismatch existing parent type', async () => {
    const parent = await createAccount(workplaceId, {
      name: 'Asset Parent',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId,
    });

    const child = await createAccount(workplaceId, {
      name: 'Asset Child',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      parentAccountId: parent.id,
      workplaceId,
    });

    await expect(
      updateAccount(workplaceId, child.id, { accountType: AccountType.LIABILITY }),
    ).rejects.toThrow('Parent account must be of the same type');
  });
});
