import { Q } from '@nozbe/watermelondb'
import { BALANCE_EPSILON, MIN_EXCHANGE_RATE } from '../../domain/accounting/AccountingConstants'
import { JournalPresenter } from '../../domain/accounting/JournalPresenter'
import { auditService } from '../../services/audit-service'
import { rebuildQueueService } from '../../services/rebuild-queue-service'
import { sanitizeAmount } from '../../utils/validation'
import { database } from '../database/Database'
import Account, { AccountType } from '../models/Account'
import { AuditAction } from '../models/AuditLog'
import Journal, { JournalStatus } from '../models/Journal'
import Transaction, { TransactionType } from '../models/Transaction'
import { accountRepository } from './AccountRepository'
import { transactionRepository } from './TransactionRepository'

export interface CreateJournalData {
  journalDate: number
  description?: string
  currencyCode: string
  transactions: Array<{
    accountId: string
    amount: number
    transactionType: TransactionType
    notes?: string
    exchangeRate?: number // For multi-currency transactions
  }>
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
    const getJournalAmount = (t: typeof transactionData[0]) => {
      const rate = t.exchangeRate || 1
      return t.amount * rate
    }

    const totalDebits = transactionData
      .filter(t => t.transactionType === TransactionType.DEBIT)
      .reduce((sum, t) => sum + getJournalAmount(t), 0)

    const totalCredits = transactionData
      .filter(t => t.transactionType === TransactionType.CREDIT)
      .reduce((sum, t) => sum + getJournalAmount(t), 0)

    // Validate double-entry accounting with epsilon
    const difference = Math.abs(totalDebits - totalCredits)

    if (difference > BALANCE_EPSILON) {
      throw new Error(
        `Double-entry violation: total debits (${totalDebits.toFixed(4)}) must equal total credits (${totalCredits.toFixed(4)}).`
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

      const latestTx = (await transactionRepository.findByAccount(tx.accountId))[0]
      const isBackdated = latestTx && latestTx.transactionDate > journalData.journalDate

      if (isBackdated) {
        accountsToRebuild.add(tx.accountId)
      } else {
        const account = accountMap.get(tx.accountId)!
        let balance = latestTx?.runningBalance || 0
        let multiplier = 0
        if (['ASSET', 'EXPENSE'].includes(account.accountType)) {
          multiplier = tx.transactionType === TransactionType.DEBIT ? 1 : -1
        } else {
          multiplier = tx.transactionType === TransactionType.CREDIT ? 1 : -1
        }
        balance += (tx.amount * multiplier)
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
        j.totalAmount = Math.max(Math.abs(totalDebits), Math.abs(totalCredits))
        j.transactionCount = transactionData.length
        j.displayType = JournalPresenter.getJournalType(transactionData as any, accountTypes)
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
      rebuildQueueService.enqueueMany(accountsToRebuild)
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
    const getJournalAmount = (t: typeof transactionData[0]) => {
      const rate = t.exchangeRate || 1
      return t.amount * rate
    }

    const totalDebits = transactionData
      .filter(t => t.transactionType === TransactionType.DEBIT)
      .reduce((sum, t) => sum + getJournalAmount(t), 0)

    const totalCredits = transactionData
      .filter(t => t.transactionType === TransactionType.CREDIT)
      .reduce((sum, t) => sum + getJournalAmount(t), 0)

    const difference = Math.abs(totalDebits - totalCredits)
    if (difference > BALANCE_EPSILON) {
      throw new Error(
        `Double-entry violation: total debits (${totalDebits.toFixed(4)}) must equal total credits (${totalCredits.toFixed(4)}).`
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
        const account = accountMap.get(tx.accountId)!
        let balance = latestOtherTx?.runningBalance || 0
        let multiplier = 0
        if (['ASSET', 'EXPENSE'].includes(account.accountType)) {
          multiplier = tx.transactionType === TransactionType.DEBIT ? 1 : -1
        } else {
          multiplier = tx.transactionType === TransactionType.CREDIT ? 1 : -1
        }
        balance += (tx.amount * multiplier)
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
      const newTotalAmount = Math.max(Math.abs(totalDebits), Math.abs(totalCredits))
      const newTransactionCount = transactionData.length
      const newDisplayType = JournalPresenter.getJournalType(transactionData as any, accountTypes)

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
    rebuildQueueService.enqueueMany(allAffectedAccountIds)

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

      // Log audit trail for reversal
      await auditService.log({
        entityType: 'journal',
        entityId: originalJournalId,
        action: AuditAction.UPDATE,
        changes: {
          action: 'REVERSED',
          reversalJournalId: newReversalJournal.id,
          reason: reason,
        }
      })

      return newReversalJournal
    })

    // Queue rebuild for background processing
    rebuildQueueService.enqueueMany(accountIdsToRebuild)

    return reversalJournal
  }

  async delete(journal: Journal): Promise<void> {
    // 1. Find associated transactions BEFORE write block
    const associatedTransactions = await this.transactions
      .query(Q.where('journal_id', journal.id), Q.where('deleted_at', Q.eq(null)))
      .fetch()

    const accountIdsToRebuild = new Set(associatedTransactions.map(tx => tx.accountId))

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

      // Log audit trail
      await auditService.log({
        entityType: 'journal',
        entityId: journal.id,
        action: AuditAction.DELETE,
        changes: {
          description: journal.description,
          totalAmount: journal.totalAmount,
        }
      })
    })

    // 3. Queue rebuild for background processing
    rebuildQueueService.enqueueMany(accountIdsToRebuild)
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
      .fetch() as any[]

    if (txs.length === 0) return { income: 0, expense: 0 }

    const accountIds = Array.from(new Set(txs.map(t => t.accountId)))
    const accounts = await database.collections.get<Account>('accounts')
      .query(Q.where('id', Q.oneOf(accountIds)))
      .fetch()

    const accountTypeMap = accounts.reduce((acc: any, a: any) => {
      acc[a.id] = a.accountType
      return acc
    }, {} as Record<string, AccountType>)

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
    console.log('Starting Journal Totals Backfill...')
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
    console.log(`Backfill complete. Updated ${updatedCount} journals.`)
  }
}

export const journalRepository = new JournalRepository()
