import { AppConfig } from '@/src/constants';
import Account, { AccountType } from '@/src/data/models/Account';
import { AuditAction } from '@/src/data/models/AuditLog';
import { TransactionType } from '@/src/data/models/Transaction';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { currencyRepository } from '@/src/data/repositories/CurrencyRepository';
import { journalService } from '@/src/features/journal/services/JournalService';
import { auditService } from '@/src/services/audit-service';
import { balanceService } from '@/src/services/BalanceService';
import { rebuildQueueService } from '@/src/services/RebuildQueueService';
import { logger } from '@/src/utils/logger';
import { getEpsilon, roundToPrecision } from '@/src/utils/money';
import { preferences } from '@/src/utils/preferences';

export interface CreateAccountData {
    name: string;
    accountType: string;
    currencyCode: string;
    description?: string;
    icon?: string;
    initialBalance?: number;
    orderNum?: number;
    parentAccountId?: string;
}

export class AccountService {
    /**
     * Creates a new account, handles audit logging, and sets up initial balance if needed.
     */
    async createAccount(data: CreateAccountData): Promise<Account> {
        // Default order to end of list
        const orderNum = data.orderNum ?? await accountRepository.countNonDeleted();

        const currencyCode = data.currencyCode || preferences.defaultCurrencyCode || AppConfig.defaultCurrency;

        // 1. Create account
        const account = await accountRepository.create({
            name: data.name,
            accountType: data.accountType as AccountType,
            currencyCode: currencyCode,
            description: data.description,
            icon: data.icon,
            orderNum: orderNum,
            parentAccountId: data.parentAccountId
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

        // 3. Initial Balance Journal
        if (data.initialBalance && Math.abs(data.initialBalance) > getEpsilon(precision)) {
            const roundedAmount = roundToPrecision(Math.abs(data.initialBalance), precision);
            const balancingAccountId = await this.getOpeningBalancesAccountId(data.currencyCode);

            // Direction: Assets/Expenses are DR+, Liabilities/Equity/Income are CR+
            const isIncreaseDR = ['ASSET', 'EXPENSE'].includes(data.accountType);
            const accountTxType = data.initialBalance > 0
                ? (isIncreaseDR ? TransactionType.DEBIT : TransactionType.CREDIT)
                : (isIncreaseDR ? TransactionType.CREDIT : TransactionType.DEBIT);

            const balancingTxType = accountTxType === TransactionType.DEBIT ? TransactionType.CREDIT : TransactionType.DEBIT;

            await journalService.createJournal({
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

        const updatedAccount = await accountRepository.update(account, {
            name: updates.name,
            accountType: updates.accountType as AccountType,
            currencyCode: updates.currencyCode,
            description: updates.description,
            icon: updates.icon,
            orderNum: updates.orderNum,
            parentAccountId: updates.parentAccountId
        });

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
        const name = `Opening Balances (${currencyCode})`;
        const existing = await this.findAccountByName(name);
        if (existing) return existing.id;

        return (await accountRepository.create({
            name,
            accountType: AccountType.EQUITY,
            currencyCode,
            description: 'System account for initial balances',
            icon: 'scale'
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
        const isDRType = [AccountType.ASSET, AccountType.EXPENSE].includes(account.accountType as AccountType);

        // If we need to INCREASE the balance:
        // For ASSET (DR+): DEBIT account, CREDIT Balance Correction
        // For EQUITY (CR+): CREDIT account, DEBIT Balance Correction

        const amount = Math.abs(discrepancy);
        const accountTxType = discrepancy > 0
            ? (isDRType ? TransactionType.DEBIT : TransactionType.CREDIT)
            : (isDRType ? TransactionType.CREDIT : TransactionType.DEBIT);

        const balancingTxType = accountTxType === TransactionType.DEBIT ? TransactionType.CREDIT : TransactionType.DEBIT;

        await journalService.createJournal({
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
        const targetCurrency = currencyCode || preferences.defaultCurrencyCode || AppConfig.defaultCurrency;
        const legacyNames = ['Balance Corrections', 'Balance Correction', 'Balance Corrections ()'];

        // 1. Check legacy names with matching currency
        for (const legacyName of legacyNames) {
            const legacy = await this.findAccountByName(legacyName);
            // Match if currency is correct, OR if we're looking for default currency and the legacy one has NO currency
            if (legacy && (legacy.currencyCode === targetCurrency || (!legacy.currencyCode && targetCurrency === preferences.defaultCurrencyCode))) {
                return legacy.id;
            }
        }

        // 2. Check for standard name
        const name = `Balance Corrections (${targetCurrency})`;
        const existing = await this.findAccountByName(name);
        if (existing) return existing.id;

        // 3. Last chance: find ANY account with 'Balance Correction' in the name and right currency
        // This handles cases where currency might be slightly different in name but correct in field
        const allAccounts = await accountRepository.findAll();
        const fallback = allAccounts.find(a =>
            a.name.includes('Balance Correction') &&
            a.currencyCode === targetCurrency &&
            !a.deletedAt
        );
        if (fallback) return fallback.id;

        return (await accountRepository.create({
            name,
            accountType: AccountType.EQUITY,
            currencyCode: targetCurrency,
            description: 'System account for balance corrections',
            icon: 'construct'
        })).id;
    }
}

export const accountService = new AccountService();
