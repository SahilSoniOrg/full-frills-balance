import { Q } from '@nozbe/watermelondb'
import { auditService } from '../../services/audit-service'
import { AccountUpdateInput } from '../../types/Account'
import { database } from '../database/Database'
import Account, { AccountType } from '../models/Account'
import { AuditAction } from '../models/AuditLog'
import { JournalStatus } from '../models/Journal'
import Transaction from '../models/Transaction'

export interface AccountCreateInput {
  name: string
  accountType: AccountType
  currencyCode: string
  description?: string
  parentAccountId?: string
  initialBalance?: number
}

export interface AccountBalance {
  accountId: string
  balance: number
  transactionCount: number
  asOfDate: number
  accountType: AccountType
}

export class AccountRepository {
  /**
   * Returns whether any accounts exist
   */
  async exists(): Promise<boolean> {
    const count = await this.accounts.query(Q.where('deleted_at', Q.eq(null))).fetchCount()
    return count > 0
  }

  private get db() {
    return database
  }

  private get accounts() {
    return this.db.collections.get<Account>('accounts')
  }

  private get transactions() {
    return this.db.collections.get<Transaction>('transactions')
  }

  /**
   * Normalized balance direction map for account types
   * Positive values increase balance, negative values decrease balance
   */
  private getBalanceDirection(accountType: AccountType): { debit: number; credit: number } {
    switch (accountType) {
      case AccountType.ASSET:
      case AccountType.EXPENSE:
        return { debit: 1, credit: -1 } // Debits increase, credits decrease
      case AccountType.LIABILITY:
      case AccountType.EQUITY:
      case AccountType.INCOME:
        return { debit: -1, credit: 1 } // Credits increase, debits decrease
      default:
        return { debit: 0, credit: 0 }
    }
  }

  /**
   * Computes derived account balance as of a specific date
   * 
   * Rules:
   * - Only includes transactions from POSTED journals
   * - Excludes transactions from REVERSED journals  
   * - Date filtering applies to journalDate only (accounting principle)
   * - Default asOfDate means "up to latest posted journal"
   * 
   * @param accountId Account ID to calculate balance for
   * @param asOfDate Optional cutoff date (timestamp). Defaults to current time.
   */
  async getAccountBalance(accountId: string, asOfDate?: number): Promise<AccountBalance> {
    const account = await this.find(accountId)
    if (!account) {
      throw new Error(`Account ${accountId} not found`)
    }

    const cutoffDate = asOfDate || Date.now()

    // 1. Get latest transaction for running balance (O(1))
    const latestTxs = await this.transactions
      .query(
        Q.on('journals', Q.and(
          Q.where('status', JournalStatus.POSTED),
          Q.where('deleted_at', Q.eq(null))
        )),
        Q.where('account_id', accountId),
        Q.where('deleted_at', Q.eq(null)),
        // Use transaction_date which maps to journal_date
        Q.where('transaction_date', Q.lte(cutoffDate))
      )
      .extend(Q.sortBy('transaction_date', 'desc'))
      .extend(Q.sortBy('created_at', 'desc'))
      .extend(Q.take(1))
      .fetch()

    const balance = latestTxs.length > 0 ? (latestTxs[0].runningBalance || 0) : 0

    // 2. Get transaction count (Fast Count)
    const transactionCount = await this.transactions
      .query(
        Q.on('journals', Q.and(
          Q.where('status', JournalStatus.POSTED),
          Q.where('deleted_at', Q.eq(null))
        )),
        Q.where('account_id', accountId),
        Q.where('deleted_at', Q.eq(null)),
        Q.where('transaction_date', Q.lte(cutoffDate))
      )
      .fetchCount()

    return {
      accountId: account.id,
      balance,
      transactionCount,
      asOfDate: cutoffDate,
      accountType: account.accountType
    }
  }

  /**
   * Gets balances for all accounts in batch
   * Optimized to avoid fetching all transactions
   */
  async getAccountBalances(asOfDate?: number): Promise<AccountBalance[]> {
    const accounts = await this.findAll()
    // Process in parallel
    return Promise.all(accounts.map(acc => this.getAccountBalance(acc.id, asOfDate)))
  }

  /**
   * Creates a new account
   * Supports optional initial balance by creating a "Balance Adjustment" journal
   */
  async create(accountData: AccountCreateInput): Promise<Account> {
    const { initialBalance, ...accountFields } = accountData

    // 1. Create the account
    const newAccount = await this.db.write(async () => {
      return this.accounts.create((account) => {
        Object.assign(account, accountFields)
      })
    })

    // 2. Audit account creation
    await auditService.log({
      entityType: 'account',
      entityId: newAccount.id,
      action: AuditAction.CREATE,
      changes: {
        name: newAccount.name,
        accountType: newAccount.accountType,
        currencyCode: newAccount.currencyCode,
        description: newAccount.description
      }
    })

    // 3. Handle initial balance if provided and non-zero
    if (initialBalance && Math.abs(initialBalance) > 0) {
      const { journalRepository } = require('./JournalRepository')
      const { TransactionType } = require('../models/Transaction')

      // Determine if we need an EQUITY or INCOME account for balancing
      // For simplicity in v1, we'll use a virtual "Opening Balances" account (EQUITY)
      // or just assume Equity.
      let balancingAccountId = await this.getOpeningBalancesAccountId(newAccount.currencyCode)

      const isDebitIncrease = [AccountType.ASSET, AccountType.EXPENSE].includes(newAccount.accountType)

      // If Asset increases with Debit, and we want positive balance -> Debit Account, Credit Equity
      // If Liability increases with Credit, and we want positive balance -> Credit Account, Debit Equity
      const accountTxType = isDebitIncrease ? TransactionType.DEBIT : TransactionType.CREDIT
      const equityTxType = isDebitIncrease ? TransactionType.CREDIT : TransactionType.DEBIT

      await journalRepository.createJournalWithTransactions({
        journalDate: Date.now(),
        description: `Initial Balance: ${newAccount.name}`,
        currencyCode: newAccount.currencyCode,
        transactions: [
          {
            accountId: newAccount.id,
            amount: Math.abs(initialBalance),
            transactionType: accountTxType
          },
          {
            accountId: balancingAccountId,
            amount: Math.abs(initialBalance),
            transactionType: equityTxType
          }
        ]
      })
    }

    return newAccount
  }

  /**
   * Helper to get or create the "Opening Balances" equity account
   */
  private async getOpeningBalancesAccountId(currencyCode: string): Promise<string> {
    const name = `Opening Balances (${currencyCode})`
    const existing = await this.findByName(name)
    if (existing) return existing.id

    // Use a direct write to bypass the 'create' wrapper's recursion
    const openingAcc = await this.db.write(async () => {
      return this.accounts.create((account) => {
        account.name = name
        account.accountType = AccountType.EQUITY
        account.currencyCode = currencyCode
        account.description = 'System account for initial balances'
      })
    })
    return openingAcc.id
  }

  /**
   * Finds an account by ID
   */
  async find(id: string): Promise<Account | null> {
    return this.accounts.find(id)
  }

  /**
   * Finds an account by name
   */
  async findByName(name: string): Promise<Account | null> {
    const accounts = await this.accounts
      .query(
        Q.and(
          Q.where('name', name),
          Q.where('deleted_at', Q.eq(null))
        )
      )
      .fetch()
    return accounts[0] || null
  }

  /**
   * Gets all active accounts
   */
  async findAll(): Promise<Account[]> {
    return this.accounts
      .query(Q.where('deleted_at', Q.eq(null)))
      .fetch()
  }

  /**
   * Gets accounts by type
   */
  async findByType(type: AccountType): Promise<Account[]> {
    return this.accounts
      .query(
        Q.and(
          Q.where('account_type', type),
          Q.where('deleted_at', Q.eq(null))
        )
      )
      .fetch()
  }

  /**
   * Gets child accounts of a parent account
   */
  async findChildren(parentAccountId: string): Promise<Account[]> {
    return this.accounts
      .query(
        Q.and(
          Q.where('parent_account_id', parentAccountId),
          Q.where('deleted_at', Q.eq(null))
        )
      )
      .fetch()
  }

  /**
   * Updates an account
   */
  async update(
    account: Account,
    updates: AccountUpdateInput
  ): Promise<Account> {
    return account.update((acc) => {
      Object.assign(acc, updates)
    })
  }

  /**
   * Soft deletes an account
   */
  async delete(account: Account): Promise<void> {
    return account.markAsDeleted()
  }
}

// Export a singleton instance
export const accountRepository = new AccountRepository()
