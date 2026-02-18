import { database } from '@/src/data/database/Database'
import Journal, { JournalStatus } from '@/src/data/models/Journal'
import Transaction, { TransactionType } from '@/src/data/models/Transaction'
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus'
import { Q } from '@nozbe/watermelondb'
import { map, of } from 'rxjs'

export interface CreateJournalData {
  journalDate: number
  description?: string
  currencyCode: string
  originalJournalId?: string
  transactions: {
    accountId: string
    amount: number
    transactionType: TransactionType
    notes?: string
    exchangeRate?: number
  }[]
}

export class JournalRepository {
  private get journals() {
    return database.collections.get<Journal>('journals')
  }

  private get transactions() {
    return database.collections.get<Transaction>('transactions')
  }

  journalsQuery(...clauses: any[]) {
    return this.journals.query(...clauses)
  }

  transactionsQuery(...clauses: any[]) {
    return this.transactions.query(...clauses)
  }

  /**
   * Reactive Observation Methods
   */

  observeAccountTransactions(accountId: string, limit: number, dateRange?: { startDate: number, endDate: number }) {
    const clauses: any[] = [
      Q.experimentalJoinTables(['journals']),
      Q.where('account_id', accountId),
      Q.where('deleted_at', Q.eq(null)),
      Q.on('journals', [
        Q.where('status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
        Q.where('deleted_at', Q.eq(null))
      ]),
      Q.sortBy('transaction_date', 'desc'),
      Q.take(limit)
    ]

    if (dateRange) {
      clauses.push(Q.where('transaction_date', Q.gte(dateRange.startDate)))
      clauses.push(Q.where('transaction_date', Q.lte(dateRange.endDate)))
    }

    return this.transactions
      .query(...clauses)
      .observeWithColumns([
        'amount',
        'currency_code',
        'transaction_type',
        'transaction_date',
        'notes',
        'running_balance',
        'exchange_rate',
        'account_id',
        'journal_id',
        'deleted_at'
      ])
  }

  observeJournalTransactions(journalId: string) {
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
      .observe()
  }

  observeById(journalId: string) {
    return this.journals
      .query(
        Q.where('id', journalId),
        Q.where('deleted_at', Q.eq(null))
      )
      .observe()
      .pipe(
        map((journals) => journals[0] || null)
      )
  }

  observeByIds(journalIds: string[]) {
    if (journalIds.length === 0) return of([] as Journal[])
    return this.journals
      .query(
        Q.where('id', Q.oneOf(journalIds)),
        Q.where('deleted_at', Q.eq(null))
      )
      .observeWithColumns([
        'journal_date',
        'description',
        'currency_code',
        'status',
        'total_amount',
        'transaction_count',
        'display_type',
        'deleted_at'
      ])
  }

  observeStatusMeta() {
    return this.journals
      .query(Q.where('deleted_at', Q.eq(null)))
      .observeWithColumns(['status', 'deleted_at', 'journal_date'])
  }

  /**
   * PURE PERSISTENCE METHODS
   */

  async find(id: string): Promise<Journal | null> {
    try {
      return await this.journals.find(id)
    } catch {
      return null
    }
  }

  async findByIds(ids: string[]): Promise<Journal[]> {
    if (ids.length === 0) return []
    return this.journals.query(Q.where('id', Q.oneOf(ids))).fetch()
  }

  async findAll(): Promise<Journal[]> {
    return this.journals
      .query(
        Q.where('deleted_at', Q.eq(null)),
        Q.where('status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES]))
      )
      .extend(Q.sortBy('journal_date', 'desc'))
      .fetch()
  }

  async findAllNonDeleted(): Promise<Journal[]> {
    return this.journals
      .query(
        Q.where('deleted_at', Q.eq(null)),
        Q.sortBy('journal_date', 'desc')
      )
      .fetch()
  }

  async countNonDeleted(): Promise<number> {
    return this.journals
      .query(Q.where('deleted_at', Q.eq(null)))
      .fetchCount()
  }

  async createJournalWithTransactions(
    journalData: CreateJournalData & { totalAmount?: number; displayType?: string; calculatedBalances?: Map<string, number> }
  ): Promise<Journal> {
    const { transactions: transactionData, totalAmount, displayType, calculatedBalances, ...journalFields } = journalData

    return await database.write(async () => {
      const journal = this.journals.prepareCreate((j) => {
        Object.assign(j, journalFields)
        j.status = JournalStatus.POSTED
        j.totalAmount = totalAmount ?? 0
        j.transactionCount = transactionData.length
        j.displayType = displayType ?? 'TRANSACTION'
        j.createdAt = new Date()
        j.updatedAt = new Date()
      })

      const transactions = transactionData.map(txData => {
        return this.transactions.prepareCreate((tx) => {
          tx.journalId = journal.id
          tx.accountId = txData.accountId
          tx.amount = txData.amount
          tx.currencyCode = journalFields.currencyCode // fallback
          tx.transactionType = txData.transactionType
          tx.transactionDate = journalFields.journalDate
          tx.notes = txData.notes
          tx.exchangeRate = txData.exchangeRate
          tx.runningBalance = calculatedBalances?.get(txData.accountId) ?? 0
          tx.createdAt = new Date()
          tx.updatedAt = new Date()
        })
      })

      await database.batch(journal, ...transactions)

      return journal
    })
  }

  async updateJournalWithTransactions(
    journalId: string,
    journalData: CreateJournalData & { totalAmount?: number; displayType?: string; calculatedBalances?: Map<string, number> }
  ): Promise<Journal> {
    const { transactions: transactionData, totalAmount, displayType, calculatedBalances, ...journalFields } = journalData

    const existingJournal = await this.find(journalId)
    if (!existingJournal) throw new Error('Journal not found')

    const oldTransactions = await this.transactions.query(Q.where('journal_id', journalId)).fetch()

    return await database.write(async () => {
      const now = new Date()

      // 1. Prepare updates for soft-delete of old transactions
      const deleteUpdates = oldTransactions.map(tx => tx.prepareUpdate((t) => {
        t.deletedAt = now
        t.updatedAt = now
      }))

      // 2. Prepare creation of new transactions
      const createUpdates = transactionData.map(txData => {
        return this.transactions.prepareCreate((tx) => {
          tx.accountId = txData.accountId
          tx.amount = txData.amount
          tx.currencyCode = journalFields.currencyCode
          tx.transactionType = txData.transactionType
          tx.journalId = journalId
          tx.transactionDate = journalFields.journalDate
          tx.notes = txData.notes
          tx.exchangeRate = txData.exchangeRate
          tx.runningBalance = calculatedBalances?.get(txData.accountId) ?? 0
          tx.createdAt = new Date()
          tx.updatedAt = new Date()
        })
      })

      // 3. Prepare journal update
      const journalUpdate = existingJournal.prepareUpdate((j: Journal) => {
        j.journalDate = journalFields.journalDate
        j.description = journalFields.description
        j.currencyCode = journalFields.currencyCode
        j.totalAmount = totalAmount ?? j.totalAmount
        j.transactionCount = transactionData.length
        j.displayType = displayType ?? j.displayType
        j.updatedAt = new Date()
      })

      await database.batch(
        journalUpdate,
        ...deleteUpdates,
        ...createUpdates
      )

      return existingJournal
    })
  }

  async deleteJournal(journalId: string): Promise<void> {
    const journal = await this.find(journalId)
    if (!journal) return

    const associatedTransactions = await this.transactions.query(Q.where('journal_id', journalId)).fetch()

    await database.write(async () => {
      const now = new Date()

      const journalUpdate = journal.prepareUpdate((j) => {
        j.deletedAt = now
        j.updatedAt = now
      })

      const transactionUpdates = associatedTransactions.map(tx => tx.prepareUpdate((t) => {
        t.deletedAt = now
        t.updatedAt = now
      }))

      await database.batch(
        journalUpdate,
        ...transactionUpdates
      )
    })
  }

  async markReversed(originalJournalId: string, reversingJournalId: string): Promise<void> {
    const journal = await this.find(originalJournalId)
    if (!journal) return

    await database.write(async () => {
      const update = journal.prepareUpdate((record) => {
        record.reversingJournalId = reversingJournalId
        record.status = JournalStatus.REVERSED
        record.updatedAt = new Date()
      })
      await database.batch(update)
    })
  }

  /**
   * Atomically replace a journal by creating a reversal + replacement in a single write.
   */
  async replaceJournalWithReversal(params: {
    originalJournal: Journal
    originalTransactions: Transaction[]
    replacementData: CreateJournalData & { totalAmount?: number; displayType?: string; calculatedBalances?: Map<string, number> }
  }): Promise<{ reversalJournal: Journal; replacementJournal: Journal }> {
    const { originalJournal, originalTransactions, replacementData } = params
    const {
      transactions: replacementTransactions,
      totalAmount,
      displayType,
      calculatedBalances,
      ...journalFields
    } = replacementData

    return await database.write(async () => {
      const now = new Date()
      const reversalDate = originalJournal.journalDate

      // 1) Prepare reversal journal
      const reversalJournal = this.journals.prepareCreate((j) => {
        j.journalDate = reversalDate
        j.description = `Reversal of: ${originalJournal.description || originalJournal.id} (Edit)`
        j.currencyCode = originalJournal.currencyCode
        j.status = JournalStatus.POSTED
        j.originalJournalId = originalJournal.id
        j.totalAmount = originalJournal.totalAmount
        j.transactionCount = originalTransactions.length
        j.displayType = originalJournal.displayType
        j.createdAt = now
        j.updatedAt = now
      })

      const reversalTransactions = originalTransactions.map(tx => {
        return this.transactions.prepareCreate((t) => {
          t.journalId = reversalJournal.id
          t.accountId = tx.accountId
          t.amount = tx.amount
          t.currencyCode = tx.currencyCode
          t.transactionType = tx.transactionType === TransactionType.DEBIT ? TransactionType.CREDIT : TransactionType.DEBIT
          t.transactionDate = reversalDate
          t.notes = `Reversal: ${tx.notes || ''}`
          t.exchangeRate = tx.exchangeRate || 1
          t.runningBalance = 0
          t.createdAt = now
          t.updatedAt = now
        })
      })

      // 2) Prepare original journal update
      const originalJournalUpdate = originalJournal.prepareUpdate((record) => {
        record.reversingJournalId = reversalJournal.id
        record.status = JournalStatus.REVERSED
        record.updatedAt = now
      })

      // 3) Prepare replacement journal
      const replacementJournal = this.journals.prepareCreate((j) => {
        Object.assign(j, journalFields)
        j.status = JournalStatus.POSTED
        j.totalAmount = totalAmount ?? 0
        j.transactionCount = replacementTransactions.length
        j.displayType = displayType ?? 'TRANSACTION'
        j.createdAt = now
        j.updatedAt = now
      })

      const newTransactions = replacementTransactions.map(txData => {
        return this.transactions.prepareCreate((tx) => {
          tx.journalId = replacementJournal.id
          tx.accountId = txData.accountId
          tx.amount = txData.amount
          tx.currencyCode = journalFields.currencyCode
          tx.transactionType = txData.transactionType
          tx.transactionDate = journalFields.journalDate
          tx.notes = txData.notes
          tx.exchangeRate = txData.exchangeRate
          tx.runningBalance = calculatedBalances?.get(txData.accountId) ?? 0
          tx.createdAt = now
          tx.updatedAt = new Date()
        })
      })

      await database.batch(
        reversalJournal,
        ...reversalTransactions,
        originalJournalUpdate,
        replacementJournal,
        ...newTransactions
      )

      return { reversalJournal, replacementJournal }
    })
  }
}

export const journalRepository = new JournalRepository()
