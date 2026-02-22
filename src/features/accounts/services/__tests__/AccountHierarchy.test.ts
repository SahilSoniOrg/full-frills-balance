import { database } from '@/src/data/database/Database';
import { AccountType } from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';
import { balanceService } from '@/src/services/BalanceService';
import { ledgerWriteService } from '@/src/services/ledger';
import { accountService } from '../AccountService';

describe('Account Hierarchy Integration', () => {
    beforeEach(async () => {
        await database.write(async () => {
            await database.unsafeResetDatabase();
        });
    });

    it('should create a parent and child account correctly', async () => {
        const parent = await accountService.createAccount({
            name: 'Parent Asset',
            accountType: AccountType.ASSET,
            currencyCode: 'USD',
            icon: 'bank'
        });

        const child = await accountService.createAccount({
            name: 'Child Asset',
            accountType: AccountType.ASSET,
            currencyCode: 'USD',
            icon: 'wallet',
            parentAccountId: parent.id
        });

        expect(child.parentAccountId).toBe(parent.id);

        const subAccounts = await parent.subAccounts.fetch();
        expect(subAccounts.length).toBe(1);
        expect(subAccounts[0].id).toBe(child.id);
    });

    it('should aggregate balances from child to parent', async () => {
        const parent = await accountService.createAccount({
            name: 'Parent',
            accountType: AccountType.ASSET,
            currencyCode: 'USD',
        });

        const child = await accountService.createAccount({
            name: 'Child',
            accountType: AccountType.ASSET,
            currencyCode: 'USD',
            parentAccountId: parent.id,
            initialBalance: 100
        });

        const other = await accountService.createAccount({
            name: 'Other',
            accountType: AccountType.ASSET,
            currencyCode: 'USD',
        });

        await ledgerWriteService.createJournal({
            journalDate: Date.now(),
            description: 'Child Tx',
            currencyCode: 'USD',
            transactions: [
                {
                    accountId: child.id,
                    amount: 50,
                    transactionType: TransactionType.DEBIT
                },
                {
                    accountId: other.id,
                    amount: 50,
                    transactionType: TransactionType.CREDIT
                }
            ]
        });

        const balances = await balanceService.getAccountBalances();
        const parentBalance = balances.find(b => b.accountId === parent.id);
        const childBalance = balances.find(b => b.accountId === child.id);

        expect(childBalance?.balance).toBe(150); // 100 + 50
        expect(parentBalance?.balance).toBe(150); // Aggregated from child
    });

    it('should handle multi-level aggregation (A -> B -> C)', async () => {
        const a = await accountService.createAccount({ name: 'A', accountType: AccountType.ASSET, currencyCode: 'USD' });
        const b = await accountService.createAccount({ name: 'B', accountType: AccountType.ASSET, currencyCode: 'USD', parentAccountId: a.id });
        const c = await accountService.createAccount({ name: 'C', accountType: AccountType.ASSET, currencyCode: 'USD', parentAccountId: b.id });

        const other = await accountService.createAccount({
            name: 'Other',
            accountType: AccountType.ASSET,
            currencyCode: 'USD',
        });

        await ledgerWriteService.createJournal({
            journalDate: Date.now(),
            description: 'C Tx',
            currencyCode: 'USD',
            transactions: [
                {
                    accountId: c.id,
                    amount: 10,
                    transactionType: TransactionType.DEBIT
                },
                {
                    accountId: other.id,
                    amount: 10,
                    transactionType: TransactionType.CREDIT
                }
            ]
        });

        const balances = await balanceService.getAccountBalances();
        const balanceA = balances.find(bl => bl.accountId === a.id);
        const balanceB = balances.find(bl => bl.accountId === b.id);
        const balanceC = balances.find(bl => bl.accountId === c.id);

        expect(balanceC?.balance).toBe(10);
        expect(balanceB?.balance).toBe(10);
        expect(balanceA?.balance).toBe(10);
    });

    it('should prevent circular dependencies (A -> B -> A)', async () => {
        const a = await accountService.createAccount({ name: 'A', accountType: AccountType.ASSET, currencyCode: 'USD' });
        const b = await accountService.createAccount({ name: 'B', accountType: AccountType.ASSET, currencyCode: 'USD', parentAccountId: a.id });

        // Attempting to set A's parent to B should fail
        await expect(accountService.updateAccount(a.id, { parentAccountId: b.id }))
            .rejects.toThrow('Circular parent relationship detected');
    });

    it('should prevent parenting between different account types', async () => {
        await accountService.createAccount({ name: 'Asset', accountType: AccountType.ASSET, currencyCode: 'USD' });
        const liability = await accountService.createAccount({ name: 'Liability', accountType: AccountType.LIABILITY, currencyCode: 'USD' });

        await expect(accountService.createAccount({
            name: 'Child',
            accountType: AccountType.ASSET,
            currencyCode: 'USD',
            parentAccountId: liability.id
        })).rejects.toThrow('Parent account must be of the same type');
    });

    it('should prevent an account with transactions from becoming a parent', async () => {
        const parent = await accountService.createAccount({
            name: 'Parent with Tx',
            accountType: AccountType.ASSET,
            currencyCode: 'USD',
            initialBalance: 100 // This creates a transaction
        });

        const child = await accountService.createAccount({
            name: 'Child',
            accountType: AccountType.ASSET,
            currencyCode: 'USD'
        });

        // Attempting to set 'parent' as child's parent should fail because it has an initial balance transaction
        await expect(accountService.updateAccount(child.id, { parentAccountId: parent.id }))
            .rejects.toThrow(/has transactions and cannot be used as a parent/);
    });

    it('should prevent creating an account with a parent that has transactions', async () => {
        const other = await accountService.createAccount({ name: 'Other', accountType: AccountType.ASSET, currencyCode: 'USD' });
        const nonEmptyAccount = await accountService.createAccount({
            name: 'Non Empty',
            accountType: AccountType.ASSET,
            currencyCode: 'USD'
        });

        // Add a transaction
        await ledgerWriteService.createJournal({
            journalDate: Date.now(),
            description: 'Tx',
            currencyCode: 'USD',
            transactions: [
                { accountId: nonEmptyAccount.id, amount: 10, transactionType: TransactionType.DEBIT },
                { accountId: other.id, amount: 10, transactionType: TransactionType.CREDIT }
            ]
        });

        await expect(accountService.createAccount({
            name: 'New Child',
            accountType: AccountType.ASSET,
            currencyCode: 'USD',
            parentAccountId: nonEmptyAccount.id
        })).rejects.toThrow(/has transactions and cannot be used as a parent/);
    });

    it('should not clear account name when updating only parentAccountId', async () => {
        const parent = await accountService.createAccount({
            name: 'Parent',
            accountType: AccountType.ASSET,
            currencyCode: 'USD'
        });

        const child = await accountService.createAccount({
            name: 'Original Child Name',
            accountType: AccountType.ASSET,
            currencyCode: 'USD',
            description: 'Original Description'
        });

        // Update ONLY parentAccountId
        const updated = await accountService.updateAccount(child.id, { parentAccountId: parent.id });

        // Verify name and description are preserved
        expect(updated.name).toBe('Original Child Name');
        expect(updated.description).toBe('Original Description');
        expect(updated.parentAccountId).toBe(parent.id);

        // Move back to top level (clear parent)
        const cleared = await accountService.updateAccount(child.id, { parentAccountId: null });
        expect(cleared.name).toBe('Original Child Name');
        expect(cleared.parentAccountId).toBeFalsy();
    });
});
