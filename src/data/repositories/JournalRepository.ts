import { Q } from '@nozbe/watermelondb'
import { MIN_EXCHANGE_RATE } from '../../services/accounting/AccountingConstants'
import { JournalDisplayType, JournalPresenter } from '../../services/accounting/JournalPresenter'
import { accountingService } from '../../services/AccountingService'
import { auditService } from '../../services/audit-service'
import { rebuildQueueService } from '../../services/rebuild-queue-service'
import { EnrichedJournal, EnrichedTransaction } from '../../types/readModels'
import { logger } from '../../utils/logger'
import { roundToPrecision } from '../../utils/money'
import { sanitizeAmount } from '../../utils/validation'
import { database } from '../database/Database'
import Account, { AccountType } from '../models/Account'
import { AuditAction } from '../models/AuditLog'
import Journal, { JournalStatus } from '../models/Journal'
import Transaction, { TransactionType } from '../models/Transaction'
import { accountRepository } from './AccountRepository'
import { currencyRepository } from './CurrencyRepository'
import { transactionRepository } from './TransactionRepository'

export interface CreateJournalData {
  journalDate: number
  description?: string
  currencyCode: string
  transactions: {
    accountId: string
    amount: number
    transactionType: TransactionType
    notes?: string
    exchangeRate?: number // For multi-currency transactions
  }[]
}

export interface JournalWithTransactionTotals {
  id: string
  journalDate: number
  description?: string
  currencyCode: string
  status: string
  createdAt: Date
  totalAmount: number
  transactionCount: number
}

export class JournalRepository {
  private get journals() {
    return database.collections.get<Journal>('journals')
  }

  private get transactions() {
    return database.collections.get<Transaction>('transactions')
  }

  /**
   * Creates a journal with its transactions
   * Enforces double-entry accounting: total debits must equal total credits
   */
  async createJournalWithTransactions(
    journalData: CreateJournalData
  ): Promise<Journal> {
    const { transactions: transactionData, ...journalFields } = journalData

    // Validate exchange rates before any calculations
    for (const t of transactionData) {
      if (t.exchangeRate !== undefined && t.exchangeRate <= MIN_EXCHANGE_RATE) {
        throw new Error(
          `Invalid exchange rate: ${t.exchangeRate}. Exchange rate must be greater than ${MIN_EXCHANGE_RATE}.`
        )
      }
    }

    // Validate double-entry accounting by converting transaction amounts to journal currency
    const validationResult = accountingService.validateBalance(transactionData.map(t => ({
      amount: t.amount,
      type: t.transactionType,
      exchangeRate: t.exchangeRate
    })));

    if (!validationResult.isValid) {
      throw new Error(
        `Double-entry violation: imbalance of ${validationResult.imbalance.toFixed(2)} in currency ${journalFields.currencyCode}.`
      )
    }

    // Prepare for Running Balance Calculation
    const accountIds = Array.from(new Set(transactionData.map(t => t.accountId)))
    const accounts = await Promise.all(accountIds.map(id => accountRepository.find(id)))
    const accountMap = new Map<string, Account>(accounts.filter((a): a is Account => !!a).map(a => [a.id, a]))

    const accountsToRebuild = new Set<string>()
    const calculatedBalances = new Map<string, number>()

    for (const tx of transactionData) {
      if (!accountMap.has(tx.accountId)) continue
      const account = accountMap.get(tx.accountId)!
      const precision = await currencyRepository.getPrecision(account.currencyCode)

      const latestTx = (await transactionRepository.findByAccount(tx.accountId))[0]
      const isBackdated = latestTx && latestTx.transactionDate > journalData.journalDate

      if (isBackdated) {
        accountsToRebuild.add(tx.accountId)
      } else {
        let balance = latestTx?.runningBalance || 0
        const multiplier = accountingService.getBalanceImpactMultiplier(account.accountType as any, tx.transactionType)
        balance = roundToPrecision(balance + (tx.amount * multiplier), precision)
        calculatedBalances.set(tx.accountId, balance)
      }
    }

    const journal = await database.write(async () => {
      // Create properties map for presenter
      const accountTypes = new Map<string, AccountType>()
      accountMap.forEach((acc, id) => accountTypes.set(id, acc.accountType as AccountType))

      const newJournal = await this.journals.create((j: Journal) => {
        j.journalDate = journalFields.journalDate
        j.description = journalFields.description
        j.currencyCode = journalFields.currencyCode
        j.status = JournalStatus.POSTED
        j.totalAmount = Math.max(Math.abs(validationResult.totalDebits), Math.abs(validationResult.totalCredits))
        j.transactionCount = transactionData.length
        j.displayType = JournalPresenter.getJournalType(transactionData, accountTypes)
      })

      // Create all transactions
      for (const txData of transactionData) {
        const amount = sanitizeAmount(txData.amount) || 0
        const running_balance = !accountsToRebuild.has(txData.accountId)
          ? calculatedBalances.get(txData.accountId)
          : 0

        await this.transactions.create((tx: Transaction) => {
          tx.accountId = txData.accountId
          tx.amount = amount
          tx.transactionType = txData.transactionType
          tx.journalId = newJournal.id
          tx.transactionDate = journalData.journalDate
          tx.notes = txData.notes
          tx.exchangeRate = txData.exchangeRate
          tx.runningBalance = running_balance
        })
      }

      return newJournal
    })

    // Log audit trail outside of write block to avoid deadlocks
    await auditService.log({
      entityType: 'journal',
      entityId: journal.id,
      action: AuditAction.CREATE,
      changes: {
        journalDate: journalData.journalDate,
        description: journalData.description,
        currencyCode: journalData.currencyCode,
        transactionCount: transactionData.length,
        transactions: transactionData.map(tx => ({
          accountId: tx.accountId,
          accountName: accountMap.get(tx.accountId)?.name,
          currencyCode: accountMap.get(tx.accountId)?.currencyCode,
          amount: tx.amount,
          type: tx.transactionType,
          notes: tx.notes
        }))
      },
    })


    // Queue rebuilds for background processing
    if (accountsToRebuild.size > 0) {
      rebuildQueueService.enqueueMany(accountsToRebuild, journalData.journalDate)
    }

    return journal
  }

  async find(id: string): Promise<Journal | null> {
    return this.journals.find(id)
  }

  async findAllWithTransactionTotals(): Promise<JournalWithTransactionTotals[]> {
    const journals = await this.journals
      .query(Q.where('deleted_at', Q.eq(null)))
      .extend(Q.sortBy('journal_date', 'desc'))
      .fetch()

    return journals.map(journal => ({
      id: journal.id,
      journalDate: journal.journalDate,
      description: journal.description,
      currencyCode: journal.currencyCode,
      status: journal.status,
      createdAt: journal.createdAt,
      totalAmount: journal.totalAmount || 0,
      transactionCount: journal.transactionCount || 0,
    }))
  }

  /**
   * Fetches enriched journals with account information.
   * Centralizes logic previously in useJournals hook.
   */
  async findEnrichedJournals(limit: number): Promise<EnrichedJournal[]> {
    const journals = await this.journals
      .query(
        Q.where('deleted_at', Q.eq(null)),
        Q.sortBy('journal_date', 'desc'),
        Q.take(limit)
      )
      .fetch()

    if (journals.length === 0) return []

    const journalIds = journals.map(j => j.id)
    const transactions = await this.transactions
      .query(
        Q.where('journal_id', Q.oneOf(journalIds)),
        Q.where('deleted_at', Q.eq(null))
      )
      .fetch()

    const accountIds = [...new Set(transactions.map(t => t.accountId))]
    const accounts = await accountRepository.findAllByIds(accountIds)
    const accountMap = new Map(accounts.map(a => [a.id, a]))

    const txsByJournal = new Map<string, Transaction[]>()
    transactions.forEach(tx => {
      const existing = txsByJournal.get(tx.journalId) || []
      existing.push(tx)
      txsByJournal.set(tx.journalId, existing)
    })

    return journals.map(j => {
      const journalTxs = txsByJournal.get(j.id) || []
      const journalAccounts = journalTxs.map(tx => {
        const acc = accountMap.get(tx.accountId) as Account | undefined
        return {
          id: tx.accountId,
          name: acc?.name || 'Unknown',
          accountType: acc?.accountType || 'ASSET',
          // Mark roles for the semantic matrix
          // CREDIT/Source = Money leaving/origin
          // DEBIT/Destination = Money entering/destination
          role: tx.transactionType === TransactionType.CREDIT ? 'SOURCE' : 'DESTINATION' as const
        }
      })

      const uniqueAccounts = Array.from(new Map(journalAccounts.map(a => [a.id, a])).values()) as EnrichedJournal['accounts']

      // Sort accounts: Sources first, then Destinations, then by name
      uniqueAccounts.sort((a, b) => {
        if (a.role === 'SOURCE' && b.role !== 'SOURCE') return -1;
        if (a.role !== 'SOURCE' && b.role === 'SOURCE') return 1;
        return a.name.localeCompare(b.name);
      });

      // Find primary source and destination types for semantic labeling
      const sourceAcc = journalAccounts.find(a => a.role === 'SOURCE')
      const destAcc = journalAccounts.find(a => a.role === 'DESTINATION')

      let semanticType: string | undefined
      let semanticLabel: string | undefined

      if (sourceAcc && destAcc) {
        const sType = JournalPresenter.getSemanticType(sourceAcc.accountType as AccountType, destAcc.accountType as AccountType)
        semanticType = sType
        semanticLabel = sType // The enum strings are user-friendly
      }

      return {
        id: j.id,
        journalDate: j.journalDate,
        description: j.description,
        currencyCode: j.currencyCode,
        status: j.status,
        totalAmount: j.totalAmount || 0,
        transactionCount: j.transactionCount || 0,
        displayType: j.displayType || 'MIXED',
        accounts: uniqueAccounts,
        semanticType,
        semanticLabel
      }
    })
  }

  /**
   * Fetches enriched transactions for a specific account.
   * Centralizes logic previously in useAccountTransactions hook.
   */
  async findEnrichedTransactionsForAccount(accountId: string, limit: number): Promise<EnrichedTransaction[]> {
    const loadedTransactions = await this.transactions
      .query(
        Q.where('account_id', accountId),
        Q.where('deleted_at', Q.eq(null)),
        Q.sortBy('transaction_date', 'desc'),
        Q.take(limit)
      )
      .fetch()

    if (loadedTransactions.length === 0) return []

    const journalIds = [...new Set(loadedTransactions.map(t => t.journalId))]
    const journals = await this.journals.query(Q.where('id', Q.oneOf(journalIds))).fetch()
    const journalMap = new Map(journals.map(j => [j.id, j]))

    const allJournalTxs = await this.transactions
      .query(Q.where('journal_id', Q.oneOf(journalIds)), Q.where('deleted_at', Q.eq(null)))
      .fetch()

    const accountIds = [...new Set(allJournalTxs.map(t => t.accountId))]
    const accounts = await accountRepository.findAllByIds(accountIds)
    const accountMap = new Map(accounts.map(a => [a.id, a]))

    return loadedTransactions.map(tx => {
      const journal = journalMap.get(tx.journalId)
      const journalTxs = allJournalTxs.filter(t => t.journalId === tx.journalId)
      const otherLegs = journalTxs.filter(t => t.accountId !== accountId)
      const account = accountMap.get(accountId) as Account | undefined

      let displayTitle = journal?.description || ''
      let counterAccountName: string | undefined = undefined
      let counterAccountType: string | undefined = undefined

      if (otherLegs.length === 1) {
        const otherAcc = accountMap.get(otherLegs[0].accountId) as Account | undefined
        displayTitle = otherAcc?.name || journal?.description || 'Offset Entry'
        counterAccountName = otherAcc?.name
        counterAccountType = otherAcc?.accountType
      } else if (otherLegs.length > 1 && !journal?.description) {
        displayTitle = 'Split'
      }

      const isIncrease = ['ASSET', 'EXPENSE'].includes(account?.accountType || '')
        ? tx.transactionType === 'DEBIT'
        : tx.transactionType === 'CREDIT'

      // Determine displayType for this specific leg
      let legDisplayType = JournalDisplayType.MIXED
      if (account?.accountType === AccountType.INCOME) legDisplayType = JournalDisplayType.INCOME
      else if (account?.accountType === AccountType.EXPENSE) legDisplayType = JournalDisplayType.EXPENSE
      else if (otherLegs.length > 0) {
        const allOtherAreAL = otherLegs.every(ol => {
          const oa = accountMap.get(ol.accountId)
          return oa?.accountType === AccountType.ASSET || oa?.accountType === AccountType.LIABILITY
        })
        if (allOtherAreAL) legDisplayType = JournalDisplayType.TRANSFER
      }

      return {
        id: tx.id,
        journalId: tx.journalId,
        accountId: tx.accountId,
        amount: tx.amount,
        currencyCode: tx.currencyCode,
        transactionType: tx.transactionType as any,
        transactionDate: tx.transactionDate,
        notes: tx.notes,
        journalDescription: journal?.description,
        accountName: account?.name,
        accountType: account?.accountType,
        counterAccountName,
        counterAccountType,
        runningBalance: tx.runningBalance,
        displayTitle,
        isIncrease,
        displayType: legDisplayType
      }
    })
  }

  async findAll(): Promise<Journal[]> {
    return this.journals
      .query(Q.where('deleted_at', Q.eq(null)))
      .extend(Q.sortBy('journal_date', 'desc'))
      .fetch()
  }

  async findByDateRange(startDate: number, endDate: number): Promise<Journal[]> {
    return this.journals
      .query(
        Q.and(
          Q.where('journal_date', Q.gte(startDate)),
          Q.where('journal_date', Q.lte(endDate)),
          Q.where('deleted_at', Q.eq(null))
        )
      )
      .extend(Q.sortBy('journal_date', 'desc'))
      .fetch()
  }

  async update(journal: Journal, updates: Partial<Journal>): Promise<Journal> {
    return database.write(async () => {
      return journal.update((j) => {
        Object.assign(j, updates)
      })
    })
  }

  /**
   * Updates a journal with new transactions
   * - Soft-deletes old transactions
   * - Creates new transactions
   * - Recalculates denormalized fields (totalAmount, transactionCount, displayType)
   * - Logs to audit trail with before/after state
   * - Rebuilds running balances for affected accounts
   */
  async updateJournalWithTransactions(
    journalId: string,
    journalData: CreateJournalData
  ): Promise<Journal> {
    const existingJournal = await this.find(journalId)
    if (!existingJournal) {
      throw new Error(`Journal ${journalId} not found`)
    }

    const { transactions: transactionData, ...journalFields } = journalData

    // Validate exchange rates
    for (const t of transactionData) {
      if (t.exchangeRate !== undefined && t.exchangeRate <= MIN_EXCHANGE_RATE) {
        throw new Error(
          `Invalid exchange rate: ${t.exchangeRate}. Exchange rate must be greater than ${MIN_EXCHANGE_RATE}.`
        )
      }
    }

    // Validate double-entry
    const validationResult = accountingService.validateBalance(transactionData.map(t => ({
      amount: t.amount,
      type: t.transactionType,
      exchangeRate: t.exchangeRate
    })));

    if (!validationResult.isValid) {
      throw new Error(
        `Double-entry violation: imbalance of ${validationResult.imbalance.toFixed(2)} in currency ${journalFields.currencyCode}.`
      )
    }

    // Collect accounts for balance rebuilding
    const oldTransactions = await this.transactions
      .query(Q.where('journal_id', journalId), Q.where('deleted_at', Q.eq(null)))
      .fetch()

    const oldAccountIds = new Set(oldTransactions.map(t => t.accountId))
    const newAccountIds = new Set(transactionData.map(t => t.accountId))
    const allAffectedAccountIds = new Set([...oldAccountIds, ...newAccountIds])

    // Prepare account types for displayType calculation
    const accountIds = Array.from(allAffectedAccountIds)
    const accounts = await Promise.all(accountIds.map(id => accountRepository.find(id)))
    const accountMap = new Map<string, Account>(accounts.filter((a): a is Account => !!a).map(a => [a.id, a]))
    const accountTypes = new Map<string, AccountType>()
    accountMap.forEach((acc, id) => accountTypes.set(id, acc.accountType as AccountType))

    // Prepare for Running Balance Calculation (Synchronous part)
    const accountsToRebuild = new Set<string>()
    const calculatedBalances = new Map<string, number>()

    for (const tx of transactionData) {
      if (!accountMap.has(tx.accountId)) continue

      // Optimized check for latest transaction
      const accountId = tx.accountId
      const account = accountMap.get(accountId)!
      const precision = await currencyRepository.getPrecision(account.currencyCode)

      const latestOtherTxs = await database.collections.get<Transaction>('transactions')
        .query(
          Q.where('account_id', accountId),
          Q.where('deleted_at', Q.eq(null)),
          Q.where('journal_id', Q.notEq(journalId)),
          Q.on('journals', Q.and(
            Q.where('status', 'POSTED'),
            Q.where('deleted_at', Q.eq(null))
          ))
        )
        .extend(Q.sortBy('transaction_date', 'desc'))
        .extend(Q.sortBy('created_at', 'desc'))
        .extend(Q.take(1))
        .fetch()

      const latestOtherTx = latestOtherTxs[0]
      const isBackdated = latestOtherTx && latestOtherTx.transactionDate > journalData.journalDate

      if (isBackdated) {
        accountsToRebuild.add(tx.accountId)
      } else {
        let balance = latestOtherTx?.runningBalance || 0
        const multiplier = accountingService.getBalanceImpactMultiplier(account.accountType as any, tx.transactionType)
        balance = roundToPrecision(balance + (tx.amount * multiplier), precision)
        calculatedBalances.set(tx.accountId, balance)
      }
    }

    // Capture before state for audit
    const beforeState = {
      journalDate: existingJournal.journalDate,
      description: existingJournal.description,
      currencyCode: existingJournal.currencyCode,
      totalAmount: existingJournal.totalAmount,
      transactionCount: existingJournal.transactionCount,
      displayType: existingJournal.displayType,
    }

    const updatedJournal = await database.write(async () => {
      // 1. Soft-delete old transactions
      for (const tx of oldTransactions) {
        await tx.update(t => {
          t.deletedAt = new Date()
        })
      }

      // 2. Create new transactions
      for (const txData of transactionData) {
        const amount = sanitizeAmount(txData.amount) || 0
        const running_balance = !accountsToRebuild.has(txData.accountId)
          ? calculatedBalances.get(txData.accountId)
          : 0

        await this.transactions.create((tx: Transaction) => {
          tx.accountId = txData.accountId
          tx.amount = amount
          tx.transactionType = txData.transactionType
          tx.journalId = journalId
          tx.transactionDate = journalFields.journalDate
          tx.notes = txData.notes
          tx.exchangeRate = txData.exchangeRate
          tx.runningBalance = running_balance
        })
      }

      // 3. Calculate new denormalized fields
      const newTotalAmount = Math.max(Math.abs(validationResult.totalDebits), Math.abs(validationResult.totalCredits))
      const newTransactionCount = transactionData.length
      const newDisplayType = JournalPresenter.getJournalType(transactionData, accountTypes)

      // 4. Update journal
      await existingJournal.update((j: Journal) => {
        j.journalDate = journalFields.journalDate
        j.description = journalFields.description
        j.currencyCode = journalFields.currencyCode
        j.totalAmount = newTotalAmount
        j.transactionCount = newTransactionCount
        j.displayType = newDisplayType
      })

      return existingJournal
    })

    // 5. Log audit trail outside of write block to avoid deadlocks
    await auditService.log({
      entityType: 'journal',
      entityId: journalId,
      action: AuditAction.UPDATE,
      changes: {
        before: {
          ...beforeState,
          transactions: oldTransactions.map(tx => ({
            accountId: tx.accountId,
            accountName: accountMap.get(tx.accountId)?.name,
            currencyCode: accountMap.get(tx.accountId)?.currencyCode,
            amount: tx.amount,
            type: tx.transactionType,
            notes: tx.notes
          }))
        },
        after: {
          journalDate: journalFields.journalDate,
          description: journalFields.description,
          currencyCode: journalFields.currencyCode,
          totalAmount: updatedJournal.totalAmount, // Use updated values
          transactionCount: updatedJournal.transactionCount,
          displayType: updatedJournal.displayType,
          transactions: transactionData.map(tx => ({
            accountId: tx.accountId,
            accountName: accountMap.get(tx.accountId)?.name,
            currencyCode: accountMap.get(tx.accountId)?.currencyCode,
            amount: tx.amount,
            type: tx.transactionType,
            notes: tx.notes
          }))
        }
      }
    })


    // 6. Queue running balance rebuilds for background processing
    const earliestChangeDate = Math.min(existingJournal.journalDate, journalData.journalDate)
    rebuildQueueService.enqueueMany(allAffectedAccountIds, earliestChangeDate)

    return updatedJournal
  }

  async createReversalJournal(originalJournalId: string, reason?: string): Promise<Journal> {
    const originalJournal = await this.find(originalJournalId)
    if (!originalJournal) throw new Error('Original journal not found')

    const originalTransactions = await this.transactions
      .query(Q.where('journal_id', originalJournalId), Q.where('deleted_at', Q.eq(null)))
      .fetch()

    const reversalTransactions = originalTransactions.map(tx => ({
      accountId: tx.accountId,
      amount: tx.amount,
      transactionType: tx.transactionType === TransactionType.DEBIT ? TransactionType.CREDIT : TransactionType.DEBIT,
      notes: reason ? `Reversal: ${reason}` : `Reversal of journal ${originalJournalId}`,
    }))

    // Collect affected accounts for rebuild
    const accountIdsToRebuild = new Set(reversalTransactions.map(tx => tx.accountId))

    const reversalJournal = await database.write(async () => {
      await originalJournal.update(j => { j.status = JournalStatus.REVERSED })

      const newReversalJournal = await this.journals.create((j: Journal) => {
        j.journalDate = originalJournal.journalDate
        j.description = reason || `Reversal of journal ${originalJournalId}`
        j.currencyCode = originalJournal.currencyCode
        j.status = JournalStatus.POSTED
        j.totalAmount = originalJournal.totalAmount
        j.transactionCount = originalJournal.transactionCount
        j.displayType = originalJournal.displayType
      })

      for (const txData of reversalTransactions) {
        await this.transactions.create((tx: Transaction) => {
          tx.accountId = txData.accountId
          tx.amount = txData.amount
          tx.transactionType = txData.transactionType
          tx.journalId = newReversalJournal.id
          tx.transactionDate = newReversalJournal.journalDate
          tx.notes = txData.notes
          tx.runningBalance = 0
        })
      }

      await originalJournal.update(j => { j.reversingJournalId = newReversalJournal.id })

      return newReversalJournal
    })

    // Log audit trail OUTSIDE write block to avoid deadlocks
    await auditService.log({
      entityType: 'journal',
      entityId: originalJournalId,
      action: AuditAction.UPDATE,
      changes: {
        action: 'REVERSED',
        reversalJournalId: reversalJournal.id,
        reason: reason,
      }
    })

    // Queue rebuild for background processing
    rebuildQueueService.enqueueMany(accountIdsToRebuild, originalJournal.journalDate)

    return reversalJournal
  }

  async delete(journal: Journal): Promise<void> {
    // 1. Find associated transactions BEFORE write block
    const associatedTransactions = await this.transactions
      .query(Q.where('journal_id', journal.id), Q.where('deleted_at', Q.eq(null)))
      .fetch()

    const accountIdsToRebuild = new Set(associatedTransactions.map(tx => tx.accountId))

    // Capture data for audit before deletion
    const auditData = {
      description: journal.description,
      totalAmount: journal.totalAmount,
    }

    // 2. All mutations in single write block (atomic)
    await database.write(async () => {
      // Mark journal as soft-deleted
      await journal.update((j) => {
        j.deletedAt = new Date()
      })

      // Soft-delete all associated transactions
      for (const tx of associatedTransactions) {
        await tx.update((t) => {
          t.deletedAt = new Date()
        })
      }
    })

    // 3. Log audit trail OUTSIDE write block to avoid deadlocks
    await auditService.log({
      entityType: 'journal',
      entityId: journal.id,
      action: AuditAction.DELETE,
      changes: auditData
    })

    // 4. Queue rebuild for background processing
    rebuildQueueService.enqueueMany(accountIdsToRebuild, journal.journalDate)
  }

  /**
   * Gets summary of income and expenses for a specific month
   */
  async getMonthlySummary(month: number, year: number): Promise<{ income: number, expense: number }> {
    const startOfMonth = new Date(year, month, 1).getTime()
    const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999).getTime()

    const txs = await this.transactions
      .query(
        Q.on('journals', Q.and(
          Q.where('status', JournalStatus.POSTED),
          Q.where('deleted_at', Q.eq(null))
        )),
        Q.where('transaction_date', Q.gte(startOfMonth)),
        Q.where('transaction_date', Q.lte(endOfMonth)),
        Q.where('deleted_at', Q.eq(null))
      )
      .fetch()

    if (txs.length === 0) return { income: 0, expense: 0 }

    const accountIds = Array.from(new Set(txs.map(t => t.accountId)))
    const accounts = await database.collections.get<Account>('accounts')
      .query(Q.where('id', Q.oneOf(accountIds)))
      .fetch()

    const accountTypeMap = accounts.reduce<Record<string, AccountType>>((acc, a) => {
      acc[a.id] = a.accountType
      return acc
    }, {})

    let totalIncome = 0
    let totalExpense = 0

    txs.forEach(t => {
      const type = accountTypeMap[t.accountId]
      if (type === AccountType.INCOME) {
        if (t.transactionType === TransactionType.CREDIT) totalIncome += t.amount
        else totalIncome -= t.amount
      } else if (type === AccountType.EXPENSE) {
        if (t.transactionType === TransactionType.DEBIT) totalExpense += t.amount
        else totalExpense -= t.amount
      }
    })

    return { income: totalIncome, expense: totalExpense }
  }

  async backfillTotals(): Promise<void> {
    logger.info('Starting Journal Totals Backfill...')
    const journals = await this.journals.query(Q.where('deleted_at', Q.eq(null))).fetch()
    let updatedCount = 0

    await database.write(async () => {
      for (const journal of journals) {
        const txs = await this.transactions
          .query(Q.where('journal_id', journal.id), Q.where('deleted_at', Q.eq(null)))
          .fetch()

        if (txs.length === 0) continue

        const transactionCount = txs.length
        const totalDebits = txs
          .filter(t => t.transactionType === TransactionType.DEBIT)
          .reduce((sum, t) => sum + (Number(t.amount) * (t.exchangeRate || 1)), 0)

        const totalCredits = txs
          .filter(t => t.transactionType === TransactionType.CREDIT)
          .reduce((sum, t) => sum + (Number(t.amount) * (t.exchangeRate || 1)), 0)

        const magnitude = Math.max(Math.abs(totalDebits), Math.abs(totalCredits))

        const accountIds = Array.from(new Set(txs.map(t => t.accountId)))
        const accounts = await database.collections.get<Account>('accounts')
          .query(Q.where('id', Q.oneOf(accountIds)))
          .fetch()
        const accountTypeMap = new Map(accounts.map(a => [a.id, a.accountType as AccountType]))
        const displayType = JournalPresenter.getJournalType(txs, accountTypeMap)

        if (
          Math.abs((journal.totalAmount || 0) - magnitude) > 0.001 ||
          journal.transactionCount !== transactionCount ||
          journal.displayType !== displayType
        ) {
          await journal.update((j: Journal) => {
            j.totalAmount = magnitude
            j.transactionCount = transactionCount
            j.displayType = displayType
          })
          updatedCount++
        }
      }
    })
    logger.info(`Backfill complete. Updated ${updatedCount} journals.`)
  }
}

export const journalRepository = new JournalRepository()
