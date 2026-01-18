import { Q } from '@nozbe/watermelondb'
import { AccountCreateInput, AccountUpdateInput } from '../../types/Account'
import { database } from '../database/Database'
import Account, { AccountType } from '../models/Account'
import { JournalStatus } from '../models/Journal'
import { TransactionType } from '../models/Transaction'

export interface AccountBalance {
  accountId: string
  balance: number
  transactionCount: number
  asOfDate: number
  accountType: AccountType
}

export class AccountRepository {
  private get accounts() {
    return database.collections.get<Account>('accounts')
  }

  private get transactions() {
    return database.collections.get('transactions')
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
    // 1. Get account to determine type
    const account = await this.find(accountId)
    if (!account) {
      throw new Error(`Account ${accountId} not found`)
    }

    // 2. Query transactions from posted, non-deleted journals
    const cutoffDate = asOfDate || Date.now()
    const validTransactions = await this.transactions
      .query(
        Q.on('journals', Q.and(
          Q.where('status', JournalStatus.POSTED),
          Q.where('deleted_at', Q.eq(null))
        )),
        Q.where('account_id', accountId),
        Q.where('deleted_at', Q.eq(null)),
        asOfDate ? Q.where('transaction_date', Q.lte(asOfDate)) : Q.where('id', Q.notEq(null))
      )
      .fetch() as any[]

    // 3. Calculate balance using normalized direction map
    const direction = this.getBalanceDirection(account.accountType)
    let balance = 0

    for (const tx of validTransactions) {
      const amount = tx.amount || 0
      if (tx.transactionType === TransactionType.DEBIT) {
        balance += amount * direction.debit
      } else if (tx.transactionType === TransactionType.CREDIT) {
        balance += amount * direction.credit
      }
    }

    console.log(`Final balance for ${account.name}: ${balance}`)

    return {
      accountId: account.id,
      balance,
      transactionCount: validTransactions.length,
      asOfDate: cutoffDate,
      accountType: account.accountType
    }
  }

  /**
   * Creates a new account
   */
  async create(accountData: AccountCreateInput): Promise<Account> {
    return database.write(async () => {
      return this.accounts.create((account) => {
        Object.assign(account, accountData)
      })
    })
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
