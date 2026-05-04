import { IconName } from '@/src/components/core/AppIcon';
import { AppConfig } from '@/src/constants';
import Account, {
  AccountSubtype,
  AccountType,
  getDefaultSubtypeForType,
} from '@/src/data/models/Account';
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
import { isDebitNormalAccountType } from '@/src/utils/accountCategory';
import { logger } from '@/src/utils/logger';
import { getEpsilon, roundToPrecision } from '@/src/utils/money';
import { preferences } from '@/src/utils/preferences';

export interface CreateAccountData {
  name: string;
  accountType: AccountType;
  accountSubtype?: AccountSubtype;
  currencyCode: string;
  description?: string;
  icon?: IconName;
  initialBalance?: number;
  orderNum?: number;
  parentAccountId?: string | null;
  workplaceId: string;
  metadata?: Partial<{
    statementDay: number;
    dueDay: number;
    minimumPaymentAmount: number;
    minimumBalanceAmount: number;
    creditLimitAmount: number;
    aprBps: number;
    emiDay: number;
    loanTenureMonths: number;
    autopayEnabled: boolean;
    gracePeriodDays: number;
    notes: string;
  }>;
}

export class AccountService {
  /**
   * Creates a new account, handles audit logging, and sets up initial balance if needed.
   */
  async createAccount(data: CreateAccountData, workplaceId: string): Promise<Account> {
    // Default order to end of list
    const orderNum = data.orderNum ?? (await accountRepository.countNonDeleted(workplaceId));

    const currencyCode =
      data.currencyCode || preferences.defaultCurrencyCode || AppConfig.defaultCurrency;

    // 0. Validate parent account if provided
    if (data.parentAccountId) {
      const parent = await accountRepository.find(data.parentAccountId, workplaceId);
      if (!parent) throw new Error('Parent account not found');
      if (parent.accountType !== data.accountType) {
        throw new Error('Parent account must be of the same type');
      }
      // Constraint: Parent account must have no transactions
      const hasTransactions = await transactionRepository.hasTransactions(data.parentAccountId);
      if (hasTransactions) {
        throw new Error(
          `Account "${parent.name}" has transactions and cannot be used as a parent.`,
        );
      }
    }

    // 1. Create account
    const account = await accountRepository.create({
      name: data.name,
      accountType: data.accountType,
      accountSubtype: data.accountSubtype ?? getDefaultSubtypeForType(data.accountType),
      currencyCode: currencyCode,
      description: data.description,
      icon: data.icon,
      orderNum: orderNum,
      parentAccountId: data.parentAccountId || undefined,
      workplaceId: data.workplaceId,
      metadata: data.metadata,
    });

    // 2. Audit creation
    const precision = await currencyRepository.getPrecision(data.currencyCode);
    await auditService.log(
      {
        entityType: 'account',
        entityId: account.id,
        action: AuditAction.CREATE,
        changes: {
          after: {
            name: account.name,
            accountType: account.accountType,
            accountSubtype: account.accountSubtype,
            currencyCode: account.currencyCode,
            description: account.description,
            icon: account.icon,
            orderNum: account.orderNum,
            parentAccountId: account.parentAccountId,
            initialBalance: data.initialBalance,
          },
        },
      },
      workplaceId,
    );

    // 2.5 Track Analytics
    analytics.logAccountCreated(account.accountType, account.currencyCode);

    // 3. Initial Balance Journal
    if (data.initialBalance && Math.abs(data.initialBalance) > getEpsilon(precision)) {
      const roundedAmount = roundToPrecision(Math.abs(data.initialBalance), precision);
      const balancingAccountId = await this.getOpeningBalancesAccountId(
        data.currencyCode,
        data.workplaceId,
      );

      // Direction: Assets/Expenses are DR+, Liabilities/Equity/Income are CR+
      const isIncreaseDR = isDebitNormalAccountType(data.accountType);
      const accountTxType =
        data.initialBalance > 0
          ? isIncreaseDR
            ? TransactionType.DEBIT
            : TransactionType.CREDIT
          : isIncreaseDR
            ? TransactionType.CREDIT
            : TransactionType.DEBIT;

      const balancingTxType =
        accountTxType === TransactionType.DEBIT ? TransactionType.CREDIT : TransactionType.DEBIT;

      await ledgerWriteService.createJournal(
        {
          journalDate: Date.now(),
          description: `Initial Balance: ${data.name}`,
          currencyCode: data.currencyCode,
          transactions: [
            {
              accountId: account.id,
              amount: roundedAmount,
              transactionType: accountTxType as any,
            },
            {
              accountId: balancingAccountId,
              amount: roundedAmount,
              transactionType: balancingTxType as any,
            },
          ],
        },
        data.workplaceId,
      );
    }

    return account;
  }

  async updateAccount(
    accountId: string,
    updates: Partial<CreateAccountData>,
    workplaceId: string,
  ): Promise<Account> {
    const account = await accountRepository.find(accountId, workplaceId);
    if (!account) throw new Error('Account not found');

    const beforeState = {
      name: account.name,
      accountType: account.accountType,
      accountSubtype: account.accountSubtype,
      currencyCode: account.currencyCode,
      description: account.description,
    };

    // Validate parent account if updated
    if (updates.parentAccountId) {
      if (updates.parentAccountId === accountId) {
        throw new Error('An account cannot be its own parent');
      }
      const parent = await accountRepository.find(updates.parentAccountId, workplaceId);
      if (!parent) throw new Error('Parent account not found');

      // Check for circular dependency
      const isCircular = await this.isDescendant(updates.parentAccountId, accountId, workplaceId);
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
        throw new Error(
          `Account "${parent.name}" has transactions and cannot be used as a parent.`,
        );
      }
    }

    // Build update object selectively to avoid overwriting existing fields with undefined
    const updatePayload: Partial<
      import('@/src/data/repositories/AccountRepository').AccountPersistenceInput
    > = {};
    if (updates.name !== undefined) updatePayload.name = updates.name;
    if (updates.accountType !== undefined) updatePayload.accountType = updates.accountType;
    if (updates.accountSubtype !== undefined) updatePayload.accountSubtype = updates.accountSubtype;
    if (updates.currencyCode !== undefined) updatePayload.currencyCode = updates.currencyCode;
    if (updates.description !== undefined) updatePayload.description = updates.description;
    if (updates.icon !== undefined) updatePayload.icon = updates.icon;
    if (updates.orderNum !== undefined) updatePayload.orderNum = updates.orderNum;

    // Handle parentAccountId specifically as it can be null (to clear parent)
    if (updates.parentAccountId !== undefined) {
      updatePayload.parentAccountId = updates.parentAccountId || undefined;
    }

    if (updates.metadata !== undefined) {
      updatePayload.metadata = updates.metadata;
    }

    logger.info('[AccountService] updateAccount payload prepared', { accountId, updatePayload });
    const updatedAccount = await accountRepository.update(account, updatePayload, workplaceId);

    await auditService.log(
      {
        entityType: 'account',
        entityId: accountId,
        action: AuditAction.UPDATE,
        changes: {
          before: {
            name: beforeState.name,
            accountType: beforeState.accountType,
            accountSubtype: beforeState.accountSubtype,
            currencyCode: beforeState.currencyCode,
            description: beforeState.description,
            icon: account.icon,
            parentAccountId: account.parentAccountId,
            metadata: await this.getPlainMetadata(accountId, workplaceId),
          },
          after: updates,
        },
      },
      workplaceId,
    );

    // Track Analytics
    analytics.trackFeatureUsage('account', 'update', {
      account_type: beforeState.accountType,
      has_parent: !!updates.parentAccountId,
      fields_updated: Object.keys(updates),
    });

    if (updates.accountType && updates.accountType !== beforeState.accountType) {
      rebuildQueueService.enqueue(account.id, 0, workplaceId);
    }

    return updatedAccount;
  }

  async reconcileAccount(accountId: string, date: Date, workplaceId: string): Promise<Account> {
    const account = await accountRepository.find(accountId, workplaceId);
    if (!account) throw new Error('Account not found');

    const updatedAccount = await accountRepository.update(
      account,
      { reconciledAt: date },
      workplaceId,
    );

    await auditService.log(
      {
        entityType: 'account',
        entityId: accountId,
        action: AuditAction.UPDATE,
        changes: { reconciledAt: date },
      },
      workplaceId,
    );

    // Track Analytics
    analytics.trackFeatureUsage('account', 'reconcile', {
      account_type: account.accountType,
      reconcile_date: date.toISOString(),
    });

    return updatedAccount;
  }

  async recoverAccount(accountId: string, workplaceId: string): Promise<void> {
    const account = await accountRepository.findWithDeleted(accountId, workplaceId);
    if (!account) return;

    await accountRepository.update(account, { deletedAt: undefined } as any, workplaceId);

    await auditService.log(
      {
        entityType: 'account',
        entityId: accountId,
        action: AuditAction.UPDATE,
        changes: {
          before: { deletedAt: account.deletedAt },
          after: { action: 'RECOVERED', deletedAt: undefined },
        },
      },
      workplaceId,
    );

    // Track Analytics
    analytics.trackFeatureUsage('account', 'recover', {
      account_type: account.accountType,
    });
  }

  async updateAccountOrder(account: Account, newOrder: number, workplaceId: string): Promise<void> {
    await accountRepository.update(account, { orderNum: newOrder }, workplaceId);

    await auditService.log(
      {
        entityType: 'account',
        entityId: account.id,
        action: AuditAction.UPDATE,
        changes: {
          before: { orderNum: account.orderNum },
          after: { orderNum: newOrder },
        },
      },
      workplaceId,
    );
  }

  async deleteAccount(accountOrId: Account | string, workplaceId: string): Promise<void> {
    const account =
      typeof accountOrId === 'string'
        ? await accountRepository.find(accountOrId, workplaceId)
        : accountOrId;
    if (!account) return;

    await accountRepository.delete(workplaceId, account);

    await auditService.log(
      {
        entityType: 'account',
        entityId: account.id,
        action: AuditAction.DELETE,
        changes: {
          before: {
            name: account.name,
            deletedAt: account.deletedAt,
          },
          after: {
            deletedAt: new Date(),
          },
        },
      },
      workplaceId,
    );

    // Track Analytics
    analytics.trackFeatureUsage('account', 'delete', {
      account_type: account.accountType,
      has_transactions: await transactionRepository.hasTransactions(account.id),
    });
  }

  async getOpeningBalancesAccountId(currencyCode: string, workplaceId: string): Promise<string> {
    const { openingBalances } = AppConfig.systemAccounts;
    const name = `${openingBalances.namePrefix} (${currencyCode})`;
    const existing = await this.findAccountByName(name, workplaceId);
    if (existing) return existing.id;

    return (
      await accountRepository.create({
        name,
        accountType: AccountType.EQUITY,
        accountSubtype: getDefaultSubtypeForType(AccountType.EQUITY),
        currencyCode,
        description: openingBalances.description,
        icon: openingBalances.icon as IconName,
        workplaceId,
      })
    ).id;
  }

  async findAccountByName(name: string, workplaceId: string): Promise<Account | null> {
    return accountRepository.findByName(name, workplaceId);
  }

  /**
   * Adjusts the balance of an account by creating a correction journal entry.
   */
  async adjustBalance(account: Account, targetBalance: number, workplaceId: string): Promise<void> {
    const precision = await currencyRepository.getPrecision(account.currencyCode);
    const currentBalanceData = await balanceService.getAccountBalance(account.id, workplaceId);
    const currentBalance = currentBalanceData.balance;

    const discrepancy = roundToPrecision(targetBalance - currentBalance, precision);
    if (Math.abs(discrepancy) < getEpsilon(precision)) {
      logger.info(
        `[AccountService] No adjustment needed for account ${account.name}. Discrepancy within epsilon.`,
      );
      return;
    }

    logger.info(
      `[AccountService] Adjusting balance for ${account.name}: ${currentBalance} -> ${targetBalance} (diff: ${discrepancy})`,
    );

    const correctionAccountId = await this.findOrCreateBalanceCorrectionAccount(
      account.currencyCode,
      workplaceId,
    );

    // Direction: Assets/Expenses are DR+, Liabilities/Equity/Income are CR+
    const isDRType = isDebitNormalAccountType(account.accountType);

    // If we need to INCREASE the balance:
    // For ASSET (DR+): DEBIT account, CREDIT Balance Correction
    // For EQUITY (CR+): CREDIT account, DEBIT Balance Correction

    const amount = Math.abs(discrepancy);
    const accountTxType =
      discrepancy > 0
        ? isDRType
          ? TransactionType.DEBIT
          : TransactionType.CREDIT
        : isDRType
          ? TransactionType.CREDIT
          : TransactionType.DEBIT;

    const balancingTxType =
      accountTxType === TransactionType.DEBIT ? TransactionType.CREDIT : TransactionType.DEBIT;

    await ledgerWriteService.createJournal(
      {
        journalDate: Date.now(),
        description: `Balance Adjustment: ${account.name}`,
        currencyCode: account.currencyCode,
        transactions: [
          {
            accountId: account.id,
            amount: amount,
            transactionType: accountTxType as any,
          },
          {
            accountId: correctionAccountId,
            amount: amount,
            transactionType: balancingTxType as any,
          },
        ],
      },
      workplaceId,
    );
  }

  async findOrCreateBalanceCorrectionAccount(
    currencyCode: string,
    workplaceId: string,
  ): Promise<string> {
    const { balanceCorrections } = AppConfig.systemAccounts;
    const targetCurrency =
      currencyCode || preferences.defaultCurrencyCode || AppConfig.defaultCurrency;

    // 1. Check legacy names with matching currency
    for (const legacyName of balanceCorrections.legacyNames) {
      const legacy = await this.findAccountByName(legacyName, workplaceId);
      // Match if currency is correct, OR if we're looking for default currency and the legacy one has NO currency
      if (
        legacy &&
        (legacy.currencyCode === targetCurrency ||
          (!legacy.currencyCode && targetCurrency === preferences.defaultCurrencyCode))
      ) {
        return legacy.id;
      }
    }

    // 2. Check for standard name
    const name = `${balanceCorrections.namePrefix} (${targetCurrency})`;
    const existing = await this.findAccountByName(name, workplaceId);
    if (existing) return existing.id;

    // 3. Last chance: find ANY account with 'Balance Correction' in the name and right currency
    // This handles cases where currency might be slightly different in name but correct in field
    const allAccounts = await accountRepository.findAll(workplaceId);
    const fallback = allAccounts.find(
      a =>
        a.name.includes(balanceCorrections.namePrefix) &&
        a.currencyCode === targetCurrency &&
        !a.deletedAt,
    );
    if (fallback) return fallback.id;

    return (
      await accountRepository.create({
        name,
        accountType: AccountType.EQUITY,
        accountSubtype: AccountSubtype.OPENING_BALANCE,
        currencyCode: targetCurrency,
        description: balanceCorrections.description,
        icon: balanceCorrections.icon as IconName,
        workplaceId,
      })
    ).id;
  }

  /**
   * Helper to check if childId is a descendant of parentId.
   * Used to prevent circular relationships.
   */
  private async isDescendant(
    potentialDescendantId: string,
    ancestorId: string,
    workplaceId: string,
  ): Promise<boolean> {
    let currentParentId = (await accountRepository.find(potentialDescendantId, workplaceId))
      ?.parentAccountId;

    while (currentParentId) {
      if (currentParentId === ancestorId) return true;
      const parent = await accountRepository.find(currentParentId, workplaceId);
      currentParentId = parent?.parentAccountId;
    }

    return false;
  }

  /**
   * Helper to get metadata as a plain object for auditing/UI.
   */
  private async getPlainMetadata(
    accountId: string,
    workplaceId: string,
  ): Promise<Record<string, any> | undefined> {
    const meta = await accountRepository.findMetadata(accountId, workplaceId);
    if (!meta) return undefined;

    return {
      statementDay: meta.statementDay,
      dueDay: meta.dueDay,
      minimumPaymentAmount: meta.minimumPaymentAmount,
      minimumBalanceAmount: meta.minimumBalanceAmount,
      creditLimitAmount: meta.creditLimitAmount,
      aprBps: meta.aprBps,
      emiDay: meta.emiDay,
      loanTenureMonths: meta.loanTenureMonths,
      autopayEnabled: meta.autopayEnabled,
      gracePeriodDays: meta.gracePeriodDays,
      payFromAccountId: meta.payFromAccountId,
      minPaymentOnly: meta.minPaymentOnly,
      minimumPaymentPercent: meta.minimumPaymentPercent,
      notes: meta.notes,
    };
  }
}

export const accountService = new AccountService();
