import { AppConfig } from '@/src/constants';
import Account, { AccountType } from '@/src/data/models/Account';
import { AuditAction } from '@/src/data/models/AuditLog';
import { TransactionType } from '@/src/data/models/Transaction';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { currencyRepository } from '@/src/data/repositories/CurrencyRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { analytics } from '@/src/services/analytics-service';
import { auditService } from '@/src/services/audit-service';
import { balanceService } from '@/src/services/BalanceService';
import { ledgerWriteService } from '@/src/services/ledger';
import { rebuildQueueService } from '@/src/services/RebuildQueueService';
import { logger } from '@/src/utils/logger';
import { getEpsilon, roundToPrecision } from '@/src/utils/money';
import { preferences } from '@/src/utils/preferences';
import { isDebitNormalAccountType } from '@/src/utils/accountCategory';

export interface CreateAccountData {
    name: string;
    accountType: string;
    currencyCode: string;
    description?: string;
    icon?: string;
    initialBalance?: number;
    orderNum?: number;
    parentAccountId?: string | null;
}

export class AccountService {
    /**
     * Creates a new account, handles audit logging, and sets up initial balance if needed.
     */
    async createAccount(data: CreateAccountData): Promise<Account> {
        // Default order to end of list
        const orderNum = data.orderNum ?? await accountRepository.countNonDeleted();

        const currencyCode = data.currencyCode || preferences.defaultCurrencyCode || AppConfig.defaultCurrency;

        // 0. Validate parent account if provided
        if (data.parentAccountId) {
            const parent = await accountRepository.find(data.parentAccountId);
            if (!parent) throw new Error('Parent account not found');
            if (parent.accountType !== data.accountType) {
                throw new Error('Parent account must be of the same type');
            }
            // Constraint: Parent account must have no transactions
            const hasTransactions = await transactionRepository.hasTransactions(data.parentAccountId);
            if (hasTransactions) {
                throw new Error(`Account "${parent.name}" has transactions and cannot be used as a parent.`);
            }
        }

        // 1. Create account
        const account = await accountRepository.create({
            name: data.name,
            accountType: data.accountType as AccountType,
            currencyCode: currencyCode,
            description: data.description,
            icon: data.icon,
            orderNum: orderNum,
            parentAccountId: data.parentAccountId || undefined
        });

        // 2. Audit creation
        const precision = await currencyRepository.getPrecision(data.currencyCode);
        await auditService.log({
            entityType: 'account',
            entityId: account.id,
            action: AuditAction.CREATE,
            changes: {
                name: account.name,
                accountType: account.accountType,
                currencyCode: account.currencyCode,
                initialBalance: data.initialBalance ? roundToPrecision(data.initialBalance, precision) : undefined
            }
        });

        // 2.5 Track Analytics
        analytics.logAccountCreated(account.accountType, account.currencyCode);

        // 3. Initial Balance Journal
        if (data.initialBalance && Math.abs(data.initialBalance) > getEpsilon(precision)) {
            const roundedAmount = roundToPrecision(Math.abs(data.initialBalance), precision);
            const balancingAccountId = await this.getOpeningBalancesAccountId(data.currencyCode);

            // Direction: Assets/Expenses are DR+, Liabilities/Equity/Income are CR+
            const isIncreaseDR = isDebitNormalAccountType(data.accountType);
            const accountTxType = data.initialBalance > 0
                ? (isIncreaseDR ? TransactionType.DEBIT : TransactionType.CREDIT)
                : (isIncreaseDR ? TransactionType.CREDIT : TransactionType.DEBIT);

            const balancingTxType = accountTxType === TransactionType.DEBIT ? TransactionType.CREDIT : TransactionType.DEBIT;

            await ledgerWriteService.createJournal({
                journalDate: Date.now(),
                description: `Initial Balance: ${data.name}`,
                currencyCode: data.currencyCode,
                transactions: [
                    {
                        accountId: account.id,
                        amount: roundedAmount,
                        transactionType: accountTxType as any
                    },
                    {
                        accountId: balancingAccountId,
                        amount: roundedAmount,
                        transactionType: balancingTxType as any
                    }
                ]
            });
        }

        return account;
    }

    async updateAccount(accountId: string, updates: Partial<CreateAccountData>): Promise<Account> {
        const account = await accountRepository.find(accountId);
        if (!account) throw new Error('Account not found');

        const beforeState = {
            name: account.name,
            accountType: account.accountType,
            currencyCode: account.currencyCode,
            description: account.description
        };

        // Validate parent account if updated
        if (updates.parentAccountId) {
            if (updates.parentAccountId === accountId) {
                throw new Error('An account cannot be its own parent');
            }
            const parent = await accountRepository.find(updates.parentAccountId);
            if (!parent) throw new Error('Parent account not found');

            // Check for circular dependency
            const isCircular = await this.isDescendant(updates.parentAccountId, accountId);
            if (isCircular) {
                throw new Error('Circular parent relationship detected');
            }

            // Check account type consistency
            const newType = updates.accountType || account.accountType;
            if (parent.accountType !== newType) {
                throw new Error('Parent account must be of the same type');
            }

            // Constraint: Parent account must have no transactions
            const hasTransactions = await transactionRepository.hasTransactions(updates.parentAccountId);
            if (hasTransactions) {
                throw new Error(`Account "${parent.name}" has transactions and cannot be used as a parent.`);
            }
        }

        // Build update object selectively to avoid overwriting existing fields with undefined
        const updatePayload: any = {};
        if (updates.name !== undefined) updatePayload.name = updates.name;
        if (updates.accountType !== undefined) updatePayload.accountType = updates.accountType as AccountType;
        if (updates.currencyCode !== undefined) updatePayload.currencyCode = updates.currencyCode;
        if (updates.description !== undefined) updatePayload.description = updates.description;
        if (updates.icon !== undefined) updatePayload.icon = updates.icon;
        if (updates.orderNum !== undefined) updatePayload.orderNum = updates.orderNum;

        // Handle parentAccountId specifically as it can be null (to clear parent)
        if (updates.parentAccountId !== undefined) {
            updatePayload.parentAccountId = updates.parentAccountId;
        }

        logger.info('[AccountService] updateAccount payload prepared', { accountId, updatePayload });
        const updatedAccount = await accountRepository.update(account, updatePayload);

        await auditService.log({
            entityType: 'account',
            entityId: accountId,
            action: AuditAction.UPDATE,
            changes: { before: beforeState, after: updates }
        });

        if (updates.accountType && updates.accountType !== beforeState.accountType) {
            rebuildQueueService.enqueue(account.id, 0);
        }

        return updatedAccount;
    }

    async recoverAccount(accountId: string): Promise<void> {
        const account = await accountRepository.find(accountId);
        if (!account) return;

        await accountRepository.update(account, { deletedAt: undefined } as any);

        await auditService.log({
            entityType: 'account',
            entityId: accountId,
            action: AuditAction.UPDATE,
            changes: { action: 'RECOVERED' }
        });
    }

    async updateAccountOrder(account: Account, newOrder: number): Promise<void> {
        await accountRepository.update(account, { orderNum: newOrder });

        await auditService.log({
            entityType: 'account',
            entityId: account.id,
            action: AuditAction.UPDATE,
            changes: { orderNum: newOrder }
        });
    }

    async deleteAccount(account: Account): Promise<void> {
        await accountRepository.delete(account);

        await auditService.log({
            entityType: 'account',
            entityId: account.id,
            action: AuditAction.DELETE,
            changes: { name: account.name }
        });
    }

    async getOpeningBalancesAccountId(currencyCode: string): Promise<string> {
        const { openingBalances } = AppConfig.systemAccounts;
        const name = `${openingBalances.namePrefix} (${currencyCode})`;
        const existing = await this.findAccountByName(name);
        if (existing) return existing.id;

        return (await accountRepository.create({
            name,
            accountType: AccountType.EQUITY,
            currencyCode,
            description: openingBalances.description,
            icon: openingBalances.icon as any
        })).id;
    }

    async findAccountByName(name: string): Promise<Account | null> {
        return accountRepository.findByName(name);
    }

    /**
     * Adjusts the balance of an account by creating a correction journal entry.
     */
    async adjustBalance(account: Account, targetBalance: number): Promise<void> {
        const precision = await currencyRepository.getPrecision(account.currencyCode);
        const currentBalanceData = await balanceService.getAccountBalance(account.id);
        const currentBalance = currentBalanceData.balance;

        const discrepancy = roundToPrecision(targetBalance - currentBalance, precision);
        if (Math.abs(discrepancy) < getEpsilon(precision)) {
            logger.info(`[AccountService] No adjustment needed for account ${account.name}. Discrepancy within epsilon.`);
            return;
        }

        logger.info(`[AccountService] Adjusting balance for ${account.name}: ${currentBalance} -> ${targetBalance} (diff: ${discrepancy})`);

        const correctionAccountId = await this.findOrCreateBalanceCorrectionAccount(account.currencyCode);

        // Direction: Assets/Expenses are DR+, Liabilities/Equity/Income are CR+
        const isDRType = isDebitNormalAccountType(account.accountType);

        // If we need to INCREASE the balance:
        // For ASSET (DR+): DEBIT account, CREDIT Balance Correction
        // For EQUITY (CR+): CREDIT account, DEBIT Balance Correction

        const amount = Math.abs(discrepancy);
        const accountTxType = discrepancy > 0
            ? (isDRType ? TransactionType.DEBIT : TransactionType.CREDIT)
            : (isDRType ? TransactionType.CREDIT : TransactionType.DEBIT);

        const balancingTxType = accountTxType === TransactionType.DEBIT ? TransactionType.CREDIT : TransactionType.DEBIT;

        await ledgerWriteService.createJournal({
            journalDate: Date.now(),
            description: `Balance Adjustment: ${account.name}`,
            currencyCode: account.currencyCode,
            transactions: [
                {
                    accountId: account.id,
                    amount: amount,
                    transactionType: accountTxType as any
                },
                {
                    accountId: correctionAccountId,
                    amount: amount,
                    transactionType: balancingTxType as any
                }
            ]
        });
    }

    async findOrCreateBalanceCorrectionAccount(currencyCode: string): Promise<string> {
        const { balanceCorrections } = AppConfig.systemAccounts;
        const targetCurrency = currencyCode || preferences.defaultCurrencyCode || AppConfig.defaultCurrency;

        // 1. Check legacy names with matching currency
        for (const legacyName of balanceCorrections.legacyNames) {
            const legacy = await this.findAccountByName(legacyName);
            // Match if currency is correct, OR if we're looking for default currency and the legacy one has NO currency
            if (legacy && (legacy.currencyCode === targetCurrency || (!legacy.currencyCode && targetCurrency === preferences.defaultCurrencyCode))) {
                return legacy.id;
            }
        }

        // 2. Check for standard name
        const name = `${balanceCorrections.namePrefix} (${targetCurrency})`;
        const existing = await this.findAccountByName(name);
        if (existing) return existing.id;

        // 3. Last chance: find ANY account with 'Balance Correction' in the name and right currency
        // This handles cases where currency might be slightly different in name but correct in field
        const allAccounts = await accountRepository.findAll();
        const fallback = allAccounts.find(a =>
            a.name.includes(balanceCorrections.namePrefix) &&
            a.currencyCode === targetCurrency &&
            !a.deletedAt
        );
        if (fallback) return fallback.id;

        return (await accountRepository.create({
            name,
            accountType: AccountType.EQUITY,
            currencyCode: targetCurrency,
            description: balanceCorrections.description,
            icon: balanceCorrections.icon as any
        })).id;
    }

    /**
     * Helper to check if childId is a descendant of parentId.
     * Used to prevent circular relationships.
     */
    private async isDescendant(potentialDescendantId: string, ancestorId: string): Promise<boolean> {
        let currentParentId = (await accountRepository.find(potentialDescendantId))?.parentAccountId;

        while (currentParentId) {
            if (currentParentId === ancestorId) return true;
            const parent = await accountRepository.find(currentParentId);
            currentParentId = parent?.parentAccountId;
        }

        return false;
    }
}

export const accountService = new AccountService();
