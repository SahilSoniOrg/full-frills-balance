import { Q } from '@nozbe/watermelondb'
import { TransactionWithAccountInfo } from '../../types/readModels'
import { database } from '../database/Database'
import Transaction, { TransactionType } from '../models/Transaction'
import { accountRepository } from './AccountRepository'

export class TransactionRepository {
  private get transactions() {
    return database.collections.get<Transaction>('transactions')
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
    enforcePositiveAmount = true
  ): Promise<Transaction> {
    // Enforce positive amount invariant
    if (enforcePositiveAmount && transactionData.amount !== undefined && transactionData.amount <= 0) {
      throw new Error('Transaction amount must be positive. Sign is determined by transactionType.')
    }

    return database.write(async () => {
      return this.transactions.create((transaction) => {
        Object.assign(transaction, {
          ...transactionData,
          // Ensure amount is positive
          amount: Math.abs(transactionData.amount || 0),
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
  async findByJournalWithAccountInfo(journalId: string): Promise<TransactionWithAccountInfo[]> {
    // Get transactions for the journal
    const transactions = await this.transactions
      .query(
        Q.and(
          Q.where('journal_id', journalId),
          Q.where('deleted_at', Q.eq(null))
        )
      )
      .extend(Q.sortBy('created_at', 'asc')) // Use creation order within journal
      .fetch()

    // Get unique account IDs to fetch account information
    const accountIds = [...new Set(transactions.map(tx => tx.accountId))]
    const accounts = await Promise.all(
      accountIds.map(id => accountRepository.find(id))
    )

    // Create account lookup map
    const accountMap = new Map(
      accounts.filter(Boolean).map(acc => [acc!.id, acc!])
    )

    // Build read model with account information and running balance
    return transactions.map(tx => {
      const account = accountMap.get(tx.accountId)
      return {
        id: tx.id,
        amount: tx.amount,
        transactionType: tx.transactionType,
        currencyCode: tx.currencyCode,
        transactionDate: tx.transactionDate, // Keep for display, but journalDate determines ordering
        notes: tx.notes,
        accountName: account?.name || 'Unknown Account',
        accountType: account?.accountType || ('ASSET' as any), // Fallback for safety
        runningBalance: tx.runningBalance, // Include running balance if available
        createdAt: tx.createdAt,
        updatedAt: tx.updatedAt,
      }
    })
  }

  /**
   * Rebuilds running balances for an account
   * Uses journalDate for ordering to maintain accounting correctness
   * @param accountId The account ID to rebuild balances for
   * @param upToDate Timestamp to rebuild up to (defaults to now)
   */
  async rebuildRunningBalances(
    accountId: string,
    upToDate: number = Date.now()
  ): Promise<void> {
    // 1. Get Account to determine direction
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

    // 2. Fetch transactions ordered by Date
    // Note: We need ALL transactions to rebuild chain accurately from start
    // If we only fetch "upToDate", we might miss the start.
    // Ideally we assume start is 0. 
    // But if we want to support "partial rebuild", we'd need the balance at 'fromDate'.
    // For safety, let's rebuild ALL for now (O(N) per account is okay for 50k total txs, ~5k per account).
    const transactions = await this.transactions
      .query(
        Q.and(
          Q.where('account_id', accountId),
          Q.where('deleted_at', Q.eq(null)),
          // Standard Q.on syntax: Q.on('table', Q.where('col', val))
          Q.on('journals', Q.where('status', 'POSTED')),
          Q.on('journals', Q.where('deleted_at', Q.eq(null)))
        )
      )
      .extend(Q.sortBy('journal_date', 'asc')) // Primary sort: Journal Date
      .extend(Q.sortBy('created_at', 'asc'))   // Secondary sort: Creation Time
      .fetch()

    let runningBalance = 0

    // Update each transaction with its running balance
    await database.write(async () => {
      for (const tx of transactions) {
        // Calculate effect of this transaction
        const amount = tx.transactionType === TransactionType.DEBIT
          ? tx.amount * debitMult
          : tx.amount * creditMult

        runningBalance += amount

        // Only update if balance has changed to avoid write churn
        // Note: Floating point comparison
        if (Math.abs((tx.runningBalance || 0) - runningBalance) > 0.001) {
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
  async findByAccount(accountId: string): Promise<Transaction[]> {
    return this.transactions
      .query(
        Q.and(
          Q.where('account_id', accountId),
          Q.where('deleted_at', Q.eq(null))
        )
      )
      .extend(Q.sortBy('transaction_date', 'desc'))
      .extend(Q.sortBy('created_at', 'desc'))
      .fetch()
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

  /**
   * Updates a transaction
   */
  async update(
    transaction: Transaction,
    updates: Partial<Transaction>
  ): Promise<Transaction> {
    return transaction.update((tx) => {
      Object.assign(tx, updates)
    })
  }

  /**
   * Soft deletes a transaction
   */
  async delete(transaction: Transaction): Promise<void> {
    return transaction.markAsDeleted()
  }
}

// Export a singleton instance
export const transactionRepository = new TransactionRepository()
