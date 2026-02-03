import { database } from '@/src/data/database/Database'
import Transaction from '@/src/data/models/Transaction'
import { currencyRepository } from '@/src/data/repositories/CurrencyRepository'
import { TransactionType } from '@/src/types/domain'
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus'
import { roundToPrecision } from '@/src/utils/money'
import { Q } from '@nozbe/watermelondb'

export class TransactionRepository {
  private get transactions() {
    return database.collections.get<Transaction>('transactions')
  }

  transactionsQuery(...clauses: any[]) {
    return this.transactions.query(...clauses)
  }

  /**
   * Creates a new transaction
   * @param transactionData Transaction data to create
   * @param enforcePositiveAmount If true, will throw if amount is not positive
   * @returns The created transaction
   * @throws {Error} If amount is not positive and enforcePositiveAmount is true
   */
  async create(
    transactionData: Omit<
      Partial<Transaction>,
      'id' | 'createdAt' | 'updatedAt' | 'running_balance'
    >,
    precision: number = 2,
    enforcePositiveAmount = true
  ): Promise<Transaction> {
    // Enforce positive amount invariant
    if (enforcePositiveAmount && transactionData.amount !== undefined && transactionData.amount <= 0) {
      throw new Error('Transaction amount must be positive. Sign is determined by transactionType.')
    }

    const accountId = transactionData.accountId;
    if (!accountId) throw new Error('accountId is required for transaction creation');

    return database.write(async () => {
      return this.transactions.create((transaction) => {
        Object.assign(transaction, {
          ...transactionData,
          // Ensure amount is positive and rounded to precision
          amount: roundToPrecision(Math.abs(transactionData.amount || 0), precision),
          // Never set running_balance during creation
          running_balance: undefined,
        })
      })
    })
  }

  /**
   * Gets transactions for a journal with account information
   * Repository-owned read model for UI consumption
   * 
   * @param journalId Journal ID to fetch transactions for
   * @returns Array of transactions with account information
   */


  /**
   * Reactive version of findByJournalWithAccountInfo
   * @param journalId Journal ID to observe
   */


  /**
   * Rebuilds running balances for an account
   * Uses journalDate for ordering to maintain accounting correctness
   * @param accountId The account ID to rebuild balances for
   * @param fromDate Optional timestamp to start rebuilding from. If provided, will find the balance just before this date.
   */
  async rebuildRunningBalances(
    accountId: string,
    fromDate?: number
  ): Promise<void> {
    // 1. Get Account to determine direction
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { accountRepository } = require('./AccountRepository')
    const account = await accountRepository.find(accountId)
    if (!account) throw new Error(`Account ${accountId} not found running balance rebuild`)

    // Determine multiplier
    // Asset/Expense: Debit +, Credit -
    // Liability/Equity/Income: Credit +, Debit -
    let debitMult = 0
    let creditMult = 0

    switch (account.accountType) {
      case 'ASSET':
      case 'EXPENSE':
        debitMult = 1
        creditMult = -1
        break
      case 'LIABILITY':
      case 'EQUITY':
      case 'INCOME':
        debitMult = -1
        creditMult = 1
        break
    }

    // 2. Fetch precision for rounding
    const precision = await currencyRepository.getPrecision(account.currencyCode)

    // 3. Determine starting balance and start date
    let runningBalance = 0
    let query = this.transactions.query(
      Q.experimentalJoinTables(['journals']),
      Q.where('account_id', accountId),
      Q.where('deleted_at', Q.eq(null)),
      Q.on('journals', [
        Q.where('status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
        Q.where('deleted_at', Q.eq(null))
      ])
    )

    if (fromDate) {
      // Find the LATEST transaction BEFORE this date to get starting point
      const previousTx = await this.transactions.query(
        Q.experimentalJoinTables(['journals']),
        Q.where('account_id', accountId),
        Q.where('deleted_at', Q.eq(null)),
        Q.on('journals', [
          Q.where('status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
          Q.where('deleted_at', Q.eq(null))
        ]),
        Q.where('transaction_date', Q.lt(fromDate))
      )
        .extend(Q.sortBy('transaction_date', 'desc'))
        .extend(Q.sortBy('created_at', 'desc'))
        .extend(Q.take(1))
        .fetch()

      if (previousTx.length > 0) {
        runningBalance = previousTx[0].runningBalance || 0
        // Update query to only find transactions AFTER the previous one
        // We use >= fromDate to catch everything from the change point
        query = query.extend(Q.where('transaction_date', Q.gte(fromDate)))
      } else {
        // No previous transactions, rebuild from start
      }
    }

    const transactions = await query
      .extend(Q.sortBy('transaction_date', 'asc'))
      .extend(Q.sortBy('created_at', 'asc'))
      .fetch()

    // Update each transaction with its running balance
    await database.write(async () => {
      for (const tx of transactions) {
        // Calculate effect of this transaction
        const effect = tx.transactionType === TransactionType.DEBIT
          ? tx.amount * debitMult
          : tx.amount * creditMult

        runningBalance = roundToPrecision(runningBalance + effect, precision)

        // Only update if balance has changed to avoid write churn
        if (tx.runningBalance !== runningBalance) {
          await tx.update((txToUpdate) => {
            txToUpdate.runningBalance = runningBalance
          })
        }
      }
    })
  }

  /**
   * Finds a transaction by ID
   */
  async find(id: string): Promise<Transaction | null> {
    return this.transactions.find(id)
  }

  /**
   * Gets all transactions for an account
   */
  async findByAccount(accountId: string, limit?: number, dateRange?: { startDate: number, endDate: number }): Promise<Transaction[]> {
    const clauses: any[] = [
      Q.experimentalJoinTables(['journals']),
      Q.where('account_id', accountId),
      Q.where('deleted_at', Q.eq(null)),
      Q.on('journals', [
        Q.where('status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
        Q.where('deleted_at', Q.eq(null))
      ])
    ]

    if (dateRange) {
      clauses.push(Q.where('transaction_date', Q.gte(dateRange.startDate)))
      clauses.push(Q.where('transaction_date', Q.lte(dateRange.endDate)))
    }

    let query = this.transactions.query(...clauses)
      .extend(Q.sortBy('transaction_date', 'desc'))
      .extend(Q.sortBy('created_at', 'desc'))

    if (limit) {
      query = query.extend(Q.take(limit))
    }

    return query.fetch()
  }

  async findByJournals(journalIds: string[]): Promise<Transaction[]> {
    if (journalIds.length === 0) return []
    return this.transactions
      .query(
        Q.where('journal_id', Q.oneOf(journalIds)),
        Q.where('deleted_at', Q.eq(null))
      )
      .fetch()
  }

  observeByJournal(journalId: string) {
    return this.transactions
      .query(
        Q.experimentalJoinTables(['journals']),
        Q.where('journal_id', journalId),
        Q.where('deleted_at', Q.eq(null)),
        Q.on('journals', [
          Q.where('status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
          Q.where('deleted_at', Q.eq(null))
        ])
      )
      .extend(Q.sortBy('transaction_date', 'asc'))
      .extend(Q.sortBy('created_at', 'asc'))
      .observeWithColumns([
        'amount',
        'currency_code',
        'transaction_type',
        'transaction_date',
        'notes',
        'running_balance',
        'exchange_rate',
        'account_id',
        'journal_id'
      ])
  }

  /**
   * Observe all active (non-deleted) transactions
   * Useful for dashboard summary reactive updates
   */
  observeActive() {
    return this.transactions
      .query(
        Q.experimentalJoinTables(['journals']),
        Q.where('deleted_at', Q.eq(null)),
        Q.on('journals', [
          Q.where('status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
          Q.where('deleted_at', Q.eq(null))
        ])
      )
      .observe()
  }

  observeActiveCount(shouldThrottle: boolean = true) {
    return this.transactions
      .query(
        Q.experimentalJoinTables(['journals']),
        Q.where('deleted_at', Q.eq(null)),
        Q.on('journals', [
          Q.where('status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
          Q.where('deleted_at', Q.eq(null))
        ])
      )
      .observeCount(shouldThrottle)
  }

  /**
   * Gets all transactions for a specific journal
   * Read-only drill-down from journals
   * 
   * @param journalId Journal ID to fetch transactions for
   * @returns Array of transactions for the journal
   */
  async findByJournal(journalId: string): Promise<Transaction[]> {
    return this.transactions
      .query(
        Q.and(
          Q.where('journal_id', journalId),
          Q.where('deleted_at', Q.eq(null))
        )
      )
      .extend(Q.sortBy('transaction_date', 'asc'))
      .extend(Q.sortBy('created_at', 'asc'))
      .fetch()
  }

  async findAllNonDeleted(): Promise<Transaction[]> {
    return this.transactions
      .query(Q.where('deleted_at', Q.eq(null)))
      .fetch()
  }

  async countNonDeleted(): Promise<number> {
    return this.transactions
      .query(Q.where('deleted_at', Q.eq(null)))
      .fetchCount()
  }

  /**
   * Updates a transaction
   */
  async update(
    transaction: Transaction,
    updates: Partial<Transaction>
  ): Promise<Transaction> {
    return database.write(async () => {
      return transaction.update((tx) => {
        Object.assign(tx, updates)
      })
    })
  }

  /**
   * Soft deletes a transaction
   */
  async delete(transaction: Transaction): Promise<void> {
    await database.write(async () => {
      await transaction.update((t) => {
        t.deletedAt = new Date()
      })
    })

    // Trigger rebuild for balance integrity outside the write transaction.
    await this.rebuildRunningBalances(transaction.accountId)
  }

  /**
   * Finds the latest transaction for an account before a given date.
   * Strictly exclusive. Useful for finding the starting balance for a new transaction.
   */
  async findLatestForAccountBeforeDate(
    accountId: string,
    date: number
  ): Promise<Transaction | null> {
    return this.findLatestForAccount(accountId, date, false)
  }

  /**
   * Finds the latest transaction for an account as of a given date.
   * @param accountId Account ID
   * @param date Cutoff date
   * @param inclusive Whether to include transactions at the exact millisecond (default: true)
   */
  async findLatestForAccount(
    accountId: string,
    date: number,
    inclusive: boolean = true
  ): Promise<Transaction | null> {
    const transactions = await this.transactions
      .query(
        Q.experimentalJoinTables(['journals']),
        Q.on('journals', [
          Q.where('status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
          Q.where('deleted_at', Q.eq(null))
        ]),
        Q.where('account_id', accountId),
        Q.where('transaction_date', inclusive ? Q.lte(date) : Q.lt(date)),
        Q.where('deleted_at', Q.eq(null)),
        Q.sortBy('transaction_date', Q.desc),
        Q.sortBy('created_at', Q.desc),
        Q.take(1)
      )
      .fetch()
    return transactions[0] || null
  }

  /**
   * Finds all transactions for multiple accounts within a date range.
   * Optimized for bulk reporting.
   */
  async findByAccountsAndDateRange(
    accountIds: string[],
    startDate: number,
    endDate: number
  ): Promise<Transaction[]> {
    return this.transactions
      .query(
        Q.experimentalJoinTables(['journals']),
        Q.where('account_id', Q.oneOf(accountIds)),
        Q.where('transaction_date', Q.gte(startDate)),
        Q.where('transaction_date', Q.lte(endDate)),
        Q.where('deleted_at', Q.eq(null)),
        Q.on('journals', [
          Q.where('status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
          Q.where('deleted_at', Q.eq(null))
        ])
      )
      .extend(Q.sortBy('transaction_date', 'desc'))
      .fetch()
  }

  /**
   * Gets the transaction count for an account before a given date.
   */
  async getCountForAccount(
    accountId: string,
    cutoffDate: number = Date.now()
  ): Promise<number> {
    return this.transactions
      .query(
        Q.experimentalJoinTables(['journals']),
        Q.on('journals', [
          Q.where('status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
          Q.where('deleted_at', Q.eq(null))
        ]),
        Q.where('account_id', accountId),
        Q.where('deleted_at', Q.eq(null)),
        Q.where('transaction_date', Q.lte(cutoffDate))
      )
      .fetchCount()
  }

  /**
   * Observe transaction count for a specific date range.
   * Useful as a "trigger" for reports.
   */
  observeCountByDateRange(startDate: number, endDate: number, shouldThrottle: boolean = true) {
    return this.transactions
      .query(
        Q.experimentalJoinTables(['journals']),
        Q.where('transaction_date', Q.gte(startDate)),
        Q.where('transaction_date', Q.lte(endDate)),
        Q.where('deleted_at', Q.eq(null)),
        Q.on('journals', [
          Q.where('status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
          Q.where('deleted_at', Q.eq(null))
        ])
      )
      .observeCount(shouldThrottle)
  }

  async findForAccountUpToDate(accountId: string, cutoffDate: number): Promise<Transaction[]> {
    return this.transactions
      .query(
        Q.experimentalJoinTables(['journals']),
        Q.where('account_id', accountId),
        Q.where('transaction_date', Q.lte(cutoffDate)),
        Q.where('deleted_at', Q.eq(null)),
        Q.on('journals', [
          Q.where('status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
          Q.where('deleted_at', Q.eq(null))
        ])
      )
      .fetch()
  }
}

export const transactionRepository = new TransactionRepository()
