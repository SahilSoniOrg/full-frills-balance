import { database } from '@/src/data/database/Database'
import Account, { AccountType } from '@/src/data/models/Account'
import { AuditAction } from '@/src/data/models/AuditLog'
import { JournalStatus } from '@/src/data/models/Journal'
import Transaction, { TransactionType } from '@/src/data/models/Transaction'
import { auditRepository } from '@/src/data/repositories/AuditRepository'
import { currencyRepository } from '@/src/data/repositories/CurrencyRepository'
import { rebuildQueueService } from '@/src/data/repositories/RebuildQueue'
import { AccountBalance, AccountCreateInput, AccountUpdateInput } from '@/src/types/domain'
import { getEpsilon, roundToPrecision } from '@/src/utils/money'
import { Q } from '@nozbe/watermelondb'

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
   * Reactive Observation Methods
   */

  observeAll(includeDeleted = false) {
    const query = includeDeleted
      ? this.accounts.query(Q.sortBy('order_num', Q.asc))
      : this.accounts.query(Q.where('deleted_at', Q.eq(null)), Q.sortBy('order_num', Q.asc))
    return query.observe()
  }

  observeByType(accountType: string) {
    return this.accounts
      .query(
        Q.where('account_type', accountType),
        Q.where('deleted_at', Q.eq(null)),
        Q.sortBy('order_num', Q.asc)
      )
      .observe()
  }

  observeById(accountId: string) {
    return this.accounts.findAndObserve(accountId)
  }

  /**
   * Observe account balance.
   * Re-emits whenever transactions for this account change.
   */
  observeBalance(accountId: string) {
    return this.transactions
      .query(Q.where('account_id', accountId))
      .observe()
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
   * Returns an account's balance and transaction count as of a given date
   * @param accountId The account ID
   * @param cutoffDate Optional end date (timestamp). Defaults to now.
   */
  async getAccountBalance(
    accountId: string,
    cutoffDate: number = Date.now()
  ): Promise<AccountBalance> {
    const account = await this.find(accountId)
    if (!account) throw new Error(`Account ${accountId} not found`)

    // 1. Get running balance from latest transaction before cutoff
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
    const precision = await currencyRepository.getPrecision(newAccount.currencyCode)
    await auditRepository.log({
      entityType: 'account',
      entityId: newAccount.id,
      action: AuditAction.CREATE,
      changes: {
        name: newAccount.name,
        accountType: newAccount.accountType,
        currencyCode: newAccount.currencyCode,
        description: newAccount.description,
        initialBalance: initialBalance ? roundToPrecision(initialBalance, precision) : undefined
      }
    })

    // 3. Handle initial balance if provided and non-zero
    if (initialBalance) {
      const precision = await currencyRepository.getPrecision(newAccount.currencyCode)

      // Use precision-aware epsilon check
      if (Math.abs(initialBalance) > getEpsilon(precision)) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { journalRepository } = require('./JournalRepository')

        const roundedAmount = roundToPrecision(Math.abs(initialBalance), precision)

        let balancingAccountId = await this.getOpeningBalancesAccountId(newAccount.currencyCode)
        const direction = this.getBalanceDirection(newAccount.accountType)

        const accountTxType = direction.debit === 1 ? TransactionType.DEBIT : TransactionType.CREDIT
        const equityTxType = direction.debit === 1 ? TransactionType.CREDIT : TransactionType.DEBIT

        await journalRepository.createJournalWithTransactions({
          journalDate: Date.now(),
          description: `Initial Balance: ${newAccount.name}`,
          currencyCode: newAccount.currencyCode,
          transactions: [
            {
              accountId: newAccount.id,
              amount: roundedAmount,
              transactionType: accountTxType
            },
            {
              accountId: balancingAccountId,
              amount: roundedAmount,
              transactionType: equityTxType
            }
          ]
        })
      }
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
   * Fetches multiple accounts by ID in a single batch.
   */
  async findAllByIds(ids: string[]): Promise<Account[]> {
    if (ids.length === 0) return []
    return this.accounts.query(Q.where('id', Q.oneOf(ids))).fetch()
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
      .query(
        Q.where('deleted_at', Q.eq(null)),
        Q.sortBy('order_num', Q.asc)
      )
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
        ),
        Q.sortBy('order_num', Q.asc)
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
        ),
        Q.sortBy('order_num', Q.asc)
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
    const beforeState = {
      name: account.name,
      accountType: account.accountType,
      currencyCode: account.currencyCode,
      description: account.description,
      parentAccountId: account.parentAccountId
    }

    const updatedAccount = await this.db.write(async () => {
      await account.update((acc) => {
        Object.assign(acc, updates)
      })
      return account
    })

    // Log update
    await auditRepository.log({
      entityType: 'account',
      entityId: account.id,
      action: AuditAction.UPDATE,
      changes: {
        before: beforeState,
        after: updates
      }
    })

    // Trigger rebuild if account type changed (as it affects running balance logic)
    if (updates.accountType && updates.accountType !== beforeState.accountType) {
      rebuildQueueService.enqueue(account.id, 0) // Rebuild from the beginning
    }

    return updatedAccount
  }

  /**
   * Updates an account's order number
   */
  async updateOrder(account: Account, newOrderNum: number): Promise<void> {
    await this.db.write(async () => {
      await account.update(record => {
        record.orderNum = newOrderNum
      })
    })

    await auditRepository.log({
      entityType: 'Account',
      entityId: account.id,
      action: AuditAction.UPDATE,
      changes: { orderNum: newOrderNum }
    })
  }

  /**
   * Soft deletes an account
   */
  async delete(account: Account): Promise<void> {
    const auditData = {
      name: account.name,
      accountType: account.accountType
    }

    await this.db.write(async () => {
      await account.markAsDeleted()
    })

    await auditRepository.log({
      entityType: 'account',
      entityId: account.id,
      action: AuditAction.DELETE,
      changes: auditData
    })
  }

  async recover(accountId: string): Promise<void> {
    await this.db.write(async () => {
      const account = await this.accounts.find(accountId)

      // Clear deletion status and timestamp in raw record
      const raw = {
        ...(account as any)._raw,
        _status: 'updated',
        deleted_at: null
      }

      // Bypasses Model level restrictions by going to the adapter directly.
      // Cast to any to handle potential signature variations across adapters.
      await (this.db.adapter.batch as any)([['update', 'accounts', raw]])

      // Log recovery
      await auditRepository.log({
        entityType: 'account',
        entityId: accountId,
        action: AuditAction.UPDATE,
        changes: {
          action: 'RECOVERED',
          name: account.name
        }
      })
    })
  }
}

// Export a singleton instance
export const accountRepository = new AccountRepository()
