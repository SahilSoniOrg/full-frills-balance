import Account, { AccountType } from '@/src/data/models/Account';
import { AuditAction } from '@/src/data/models/AuditLog';
import { TransactionType } from '@/src/data/models/Transaction';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { currencyRepository } from '@/src/data/repositories/CurrencyRepository';
import { journalService } from '@/src/services/JournalService';
import { rebuildQueueService } from '@/src/services/RebuildQueueService';
import { auditService } from '@/src/services/audit-service';
import { getEpsilon, roundToPrecision } from '@/src/utils/money';

export interface CreateAccountData {
    name: string;
    accountType: string;
    currencyCode: string;
    description?: string;
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

        // 1. Create account
        const account = await accountRepository.create({
            name: data.name,
            accountType: data.accountType as AccountType,
            currencyCode: data.currencyCode,
            description: data.description,
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
            orderNum: updates.orderNum,
            parentAccountId: updates.parentAccountId
        });

        await auditService.log({
            entityType: 'account',
            entityId: accountId,
            action: AuditAction.UPDATE,
            changes: { before: beforeState, after: updates }
        });

        // Rebuild if account type changed
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

    private async getOpeningBalancesAccountId(currencyCode: string): Promise<string> {
        const name = `Opening Balances (${currencyCode})`;
        const existing = await accountRepository.findByName(name);
        if (existing) return existing.id;

        return (await accountRepository.create({
            name,
            accountType: AccountType.EQUITY,
            currencyCode,
            description: 'System account for initial balances'
        })).id;
    }
}

export const accountService = new AccountService();
