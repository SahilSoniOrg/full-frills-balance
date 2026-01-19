import { Q } from '@nozbe/watermelondb'
import { BALANCE_EPSILON, MIN_EXCHANGE_RATE } from '../../domain/accounting/AccountingConstants'
import { JournalPresenter } from '../../domain/accounting/JournalPresenter'
import { auditService } from '../../services/audit-service'
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
      return t.amount / rate
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

      // Log audit trail
      await auditService.log({
        entityType: 'journal',
        entityId: newJournal.id,
        action: AuditAction.CREATE,
        changes: {
          journalDate: journalData.journalDate,
          description: journalData.description,
          currencyCode: journalData.currencyCode,
          transactionCount: transactionData.length,
        },
      })

      return newJournal
    })

    // Trigger rebuilds
    if (accountsToRebuild.size > 0) {
      const rebuildIds = Array.from(accountsToRebuild)
      for (const accId of rebuildIds) {
        await transactionRepository.rebuildRunningBalances(accId)
      }
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
    return journal.update((j) => {
      Object.assign(j, updates)
    })
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

    return database.write(async () => {
      await originalJournal.update(j => { j.status = JournalStatus.REVERSED })

      const reversalJournal = await this.journals.create((j: Journal) => {
        j.journalDate = originalJournal.journalDate
        j.description = reason || `Reversal of journal ${originalJournalId}`
        j.currencyCode = originalJournal.currencyCode
        j.status = JournalStatus.POSTED
        j.totalAmount = originalJournal.totalAmount
        j.transactionCount = originalJournal.transactionCount
        j.displayType = originalJournal.displayType // Inherit type
      })

      for (const txData of reversalTransactions) {
        await this.transactions.create((tx: Transaction) => {
          tx.accountId = txData.accountId
          tx.amount = txData.amount
          tx.transactionType = txData.transactionType
          tx.journalId = reversalJournal.id
          tx.transactionDate = reversalJournal.journalDate
          tx.notes = txData.notes
          tx.runningBalance = 0 // Will be rebuilt if needed, or we should calc it
        })
      }

      await originalJournal.update(j => { j.reversingJournalId = reversalJournal.id })
      return reversalJournal
    })
  }

  async delete(journal: Journal): Promise<void> {
    await journal.markAsDeleted()
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
          .reduce((sum, t) => sum + (Number(t.amount) / (t.exchangeRate || 1)), 0)

        const totalCredits = txs
          .filter(t => t.transactionType === TransactionType.CREDIT)
          .reduce((sum, t) => sum + (Number(t.amount) / (t.exchangeRate || 1)), 0)

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
