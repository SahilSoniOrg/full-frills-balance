import { database } from '@/src/data/database/Database'
import Journal, { JournalStatus } from '@/src/data/models/Journal'
import Transaction, { TransactionType } from '@/src/data/models/Transaction'
import { accountRepository } from '@/src/data/repositories/AccountRepository'
import { EnrichedJournal } from '@/src/types/domain'
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus'
import { Q } from '@nozbe/watermelondb'
import { map, of, switchMap } from 'rxjs'

export interface CreateJournalData {
  journalDate: number
  description?: string
  currencyCode: string
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

  /**
   * Reactive Observation Methods
   */

  observeEnrichedJournals(limit: number, dateRange?: { startDate: number, endDate: number }) {
    const clauses: any[] = [
      Q.where('deleted_at', Q.eq(null)),
      Q.where('status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
      Q.sortBy('journal_date', 'desc'),
      Q.take(limit)
    ]

    if (dateRange) {
      clauses.push(Q.where('journal_date', Q.gte(dateRange.startDate)))
      clauses.push(Q.where('journal_date', Q.lte(dateRange.endDate)))
    }

    const journalsObservable = this.journals
      .query(...clauses)
      .observe()

    return journalsObservable.pipe(
      switchMap((journals) => {
        if (journals.length === 0) return of([] as EnrichedJournal[])

        const journalIds = journals.map(j => j.id)

        const transactionsObservable = this.transactions
          .query(
            Q.experimentalJoinTables(['journals']),
            Q.where('journal_id', Q.oneOf(journalIds)),
            Q.where('deleted_at', Q.eq(null)),
            Q.on('journals', [
              Q.where('status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
              Q.where('deleted_at', Q.eq(null))
            ])
          )
          .observe()

        return transactionsObservable.pipe(
          switchMap((transactions) => {
            const accountIds = Array.from(new Set(transactions.map(t => t.accountId)))
            return accountRepository.observeByIds(accountIds).pipe(
              map((accounts) => {
                const accountMap = new Map(accounts.map(a => [a.id, a]))
                return journals.map(j => {
                  const jTxs = transactions.filter(t => t.journalId === j.id)
                  const enrichedAccounts = Array.from(new Set(jTxs.map(t => t.accountId))).map(id => {
                    const acc = accountMap.get(id)
                    const role = jTxs.find(t => t.accountId === id)?.transactionType === TransactionType.CREDIT
                      ? 'SOURCE'
                      : 'DESTINATION'
                    return {
                      id,
                      name: acc?.name || 'Unknown',
                      accountType: acc?.accountType || 'ASSET',
                      role
                    }
                  })

                  return {
                    id: j.id,
                    journalDate: j.journalDate,
                    description: j.description,
                    currencyCode: j.currencyCode,
                    status: j.status as any,
                    totalAmount: j.totalAmount || 0,
                    transactionCount: j.transactionCount || 0,
                    displayType: j.displayType as any,
                    accounts: enrichedAccounts
                  } as EnrichedJournal
                })
              })
            )
          })
        )
      })
    )
  }

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
      .observe()
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
        'display_type'
      ])
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
    journalData: CreateJournalData & { totalAmount: number; displayType: string; calculatedBalances: Map<string, number> }
  ): Promise<Journal> {
    const { transactions: transactionData, totalAmount, displayType, calculatedBalances, ...journalFields } = journalData

    return await database.write(async () => {
      const j = await this.journals.create((j) => {
        Object.assign(j, journalFields)
        j.status = JournalStatus.POSTED
        j.totalAmount = totalAmount
        j.transactionCount = transactionData.length
        j.displayType = displayType
      })

      await Promise.all(transactionData.map(txData => {
        return this.transactions.create((tx) => {
          tx.journalId = j.id
          tx.accountId = txData.accountId
          tx.amount = txData.amount
          tx.currencyCode = journalFields.currencyCode // fallback
          tx.transactionType = txData.transactionType
          tx.transactionDate = journalFields.journalDate
          tx.notes = txData.notes
          tx.exchangeRate = txData.exchangeRate
          tx.runningBalance = calculatedBalances.get(txData.accountId)
        })
      }))

      return j
    })
  }

  async updateJournalWithTransactions(
    journalId: string,
    journalData: CreateJournalData & { totalAmount: number; displayType: string; calculatedBalances: Map<string, number> }
  ): Promise<Journal> {
    const { transactions: transactionData, totalAmount, displayType, calculatedBalances, ...journalFields } = journalData

    const existingJournal = await this.find(journalId)
    if (!existingJournal) throw new Error('Journal not found')

    const oldTransactions = await this.transactions.query(Q.where('journal_id', journalId)).fetch()

    return await database.write(async () => {
      // 1. Clear old transactions
      await Promise.all(oldTransactions.map(tx => tx.destroyPermanently()))

      // 2. Create new transactions
      await Promise.all(transactionData.map(txData => {
        return this.transactions.create((tx) => {
          tx.accountId = txData.accountId
          tx.amount = txData.amount
          tx.currencyCode = journalFields.currencyCode
          tx.transactionType = txData.transactionType
          tx.journalId = journalId
          tx.transactionDate = journalFields.journalDate
          tx.notes = txData.notes
          tx.exchangeRate = txData.exchangeRate
          tx.runningBalance = calculatedBalances.get(txData.accountId)
        })
      }))

      // 3. Update journal
      await existingJournal.update((j: Journal) => {
        j.journalDate = journalFields.journalDate
        j.description = journalFields.description
        j.currencyCode = journalFields.currencyCode
        j.totalAmount = totalAmount
        j.transactionCount = transactionData.length
        j.displayType = displayType
      })

      return existingJournal
    })
  }

  async deleteJournal(journalId: string): Promise<void> {
    const journal = await this.find(journalId)
    if (!journal) return

    const associatedTransactions = await this.transactions.query(Q.where('journal_id', journalId)).fetch()

    await database.write(async () => {
      await journal.update((j) => {
        j.deletedAt = new Date()
      })

      await Promise.all(associatedTransactions.map(tx => {
        return tx.update((t) => {
          t.deletedAt = new Date()
        })
      }))
    })
  }

  async markReversed(originalJournalId: string, reversingJournalId: string): Promise<void> {
    const journal = await this.find(originalJournalId)
    if (!journal) return

    await database.write(async () => {
      await journal.update((record) => {
        record.reversingJournalId = reversingJournalId
        record.status = JournalStatus.REVERSED
      })
    })
  }
}

export const journalRepository = new JournalRepository()
