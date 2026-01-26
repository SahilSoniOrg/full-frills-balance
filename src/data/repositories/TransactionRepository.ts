import { database } from '@/src/data/database/Database'
import Transaction from '@/src/data/models/Transaction'
import { currencyRepository } from '@/src/data/repositories/CurrencyRepository'
import { AccountType, TransactionType, TransactionWithAccountInfo } from '@/src/types/domain'
import { isBalanceIncrease, isValueEntering } from '@/src/utils/accounting-utils'
import { roundToPrecision } from '@/src/utils/money'
import { Q } from '@nozbe/watermelondb'

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

    const accountId = transactionData.accountId;
    if (!accountId) throw new Error('accountId is required for transaction creation');

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { accountRepository } = require('./AccountRepository');
    const account = await accountRepository.find(accountId);
    if (!account) throw new Error(`Account ${accountId} not found`);
    const precision = await currencyRepository.getPrecision(account.currencyCode);

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
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { accountRepository } = require('./AccountRepository')
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
      const flowDirection = isValueEntering(tx.transactionType as any) ? 'IN' : 'OUT'
      const balanceImpact = isBalanceIncrease(account?.accountType as any, tx.transactionType as any) ? 'INCREASE' : 'DECREASE'

      return {
        id: tx.id,
        amount: tx.amount,
        transactionType: tx.transactionType,
        currencyCode: tx.currencyCode,
        transactionDate: tx.transactionDate, // Keep for display, but journalDate determines ordering
        notes: tx.notes,
        accountId: tx.accountId,
        exchangeRate: tx.exchangeRate,
        accountName: account?.name || 'Unknown Account',
        accountType: account?.accountType as AccountType, // Fallback for safety
        flowDirection,
        balanceImpact,
        createdAt: tx.createdAt,
        updatedAt: tx.updatedAt,
      } as TransactionWithAccountInfo
    })
  }

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
      Q.where('account_id', accountId),
      Q.where('deleted_at', Q.eq(null)),
      Q.on('journals', Q.and(
        Q.where('status', 'POSTED'),
        Q.where('deleted_at', Q.eq(null))
      ))
    )

    if (fromDate) {
      // Find the LATEST transaction BEFORE this date to get starting point
      const previousTx = await this.transactions.query(
        Q.where('account_id', accountId),
        Q.where('deleted_at', Q.eq(null)),
        Q.on('journals', Q.and(
          Q.where('status', 'POSTED'),
          Q.where('deleted_at', Q.eq(null))
        )),
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
    return database.write(async () => {
      await transaction.update((t) => {
        t.deletedAt = new Date()
      })

      // Trigger rebuild for balance integrity
      await this.rebuildRunningBalances(transaction.accountId)
    })
  }

  /**
   * Finds the latest transaction for an account before a given date.
   * Useful for balance calculations.
   */
  async findLatestForAccountBeforeDate(
    accountId: string,
    date: number
  ): Promise<Transaction | null> {
    const transactions = await this.transactions
      .query(
        Q.where('account_id', accountId),
        Q.where('transaction_date', Q.lt(date)),
        Q.where('deleted_at', Q.eq(null)),
        Q.sortBy('transaction_date', Q.desc),
        Q.take(1)
      )
      .fetch()
    return transactions[0] || null
  }
}

// Export a singleton instance
export const transactionRepository = new TransactionRepository()
