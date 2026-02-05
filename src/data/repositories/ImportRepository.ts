import { database } from '@/src/data/database/Database'
import Account from '@/src/data/models/Account'
import AuditLog from '@/src/data/models/AuditLog'
import Journal from '@/src/data/models/Journal'
import Transaction from '@/src/data/models/Transaction'
import { Q } from '@nozbe/watermelondb'

export interface ImportedAccount {
  id: string
  name: string
  accountType: string
  currencyCode: string
  parentAccountId?: string
  description?: string
  icon?: string
  orderNum?: number
  createdAt?: number
  updatedAt?: number
  deletedAt?: number
}

export interface ImportedJournal {
  id: string
  journalDate: number
  description?: string
  currencyCode: string
  status: string
  totalAmount: number
  transactionCount: number
  displayType: string
  createdAt?: number
  updatedAt?: number
  deletedAt?: number
  originalJournalId?: string
  reversingJournalId?: string
}

export interface ImportedTransaction {
  id: string
  journalId: string
  accountId: string
  amount: number
  transactionType: string
  currencyCode: string
  transactionDate: number
  notes?: string
  exchangeRate?: number
  createdAt?: number
  updatedAt?: number
  deletedAt?: number
}

export interface ImportedAuditLog {
  id: string
  entityType: string
  entityId: string
  action: string
  changes: string
  timestamp: number
  createdAt?: number
}

export interface ChangeSet<T> {
  created?: T[]
  updated?: T[]
  deleted?: string[]
}

export interface BatchImportData {
  accounts: ImportedAccount[]
  journals: ImportedJournal[]
  transactions: ImportedTransaction[]
  auditLogs?: ImportedAuditLog[]
}

export class ImportRepository {
  async batchInsert(data: BatchImportData): Promise<void> {
    await database.write(async () => {
      const accountsCollection = database.collections.get<Account>('accounts')
      const journalsCollection = database.collections.get<Journal>('journals')
      const transactionsCollection = database.collections.get<Transaction>('transactions')
      const auditLogsCollection = database.collections.get<AuditLog>('audit_logs')

      const accountPrepares = data.accounts.map(acc =>
        accountsCollection.prepareCreate(record => {
          record._raw.id = acc.id
          record.name = acc.name
          record.accountType = acc.accountType as any
          record.currencyCode = acc.currencyCode
          record.parentAccountId = acc.parentAccountId
          record.description = acc.description
          record.icon = acc.icon
          record.orderNum = acc.orderNum
          record._raw._status = 'synced'
          if (acc.createdAt) (record as any)._raw.created_at = acc.createdAt
          if (acc.updatedAt) (record as any)._raw.updated_at = acc.updatedAt
          if (acc.deletedAt) (record as any)._raw.deleted_at = acc.deletedAt
        })
      )

      const journalPrepares = data.journals.map(j =>
        journalsCollection.prepareCreate(record => {
          record._raw.id = j.id
          record.journalDate = j.journalDate
          record.description = j.description
          record.currencyCode = j.currencyCode
          record.status = j.status as any
          record.originalJournalId = j.originalJournalId
          record.reversingJournalId = j.reversingJournalId
          record.totalAmount = j.totalAmount
          record.transactionCount = j.transactionCount
          record.displayType = j.displayType
          record._raw._status = 'synced'
          if (j.createdAt) (record as any)._raw.created_at = j.createdAt
          if (j.updatedAt) (record as any)._raw.updated_at = j.updatedAt
          if (j.deletedAt) (record as any)._raw.deleted_at = j.deletedAt
        })
      )

      const transactionPrepares = data.transactions.map(t =>
        transactionsCollection.prepareCreate(record => {
          record._raw.id = t.id
          record.journalId = t.journalId
          record.accountId = t.accountId
          record.amount = t.amount
          record.transactionType = t.transactionType as any
          record.currencyCode = t.currencyCode
          record.transactionDate = t.transactionDate
          record.notes = t.notes
          record.exchangeRate = t.exchangeRate
          record._raw._status = 'synced'
          if (t.createdAt) (record as any)._raw.created_at = t.createdAt
          if (t.updatedAt) (record as any)._raw.updated_at = t.updatedAt
          if (t.deletedAt) (record as any)._raw.deleted_at = t.deletedAt
        })
      )

      const auditLogPrepares = (data.auditLogs || []).map((log) =>
        auditLogsCollection.prepareCreate(record => {
          record._raw.id = log.id
          record.entityType = log.entityType
          record.entityId = log.entityId
          record.action = log.action as any
          record.changes = log.changes
          record.timestamp = log.timestamp
          record._raw._status = 'synced'
          if (log.createdAt) (record as any)._raw.created_at = log.createdAt
        })
      )

      const operations = [
        ...accountPrepares,
        ...journalPrepares,
        ...transactionPrepares,
        ...auditLogPrepares
      ]

      if (operations.length > 0) {
        await database.batch(...operations)
      }

      // Trigger rebuild for all involved accounts
      const uniqueAccountIds = Array.from(new Set(data.transactions.map(t => t.accountId)))
      if (uniqueAccountIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { rebuildQueueService } = require('@/src/services/RebuildQueueService')
        // We find the earliest transaction date in the import to rebuild from there
        const earliestDate = data.transactions.reduce((min, t) => Math.min(min, t.transactionDate), Date.now())
        rebuildQueueService.enqueueMany(uniqueAccountIds, earliestDate)
      }
    })
  }

  /**
   * Apply incremental changes (created/updated/deleted) for sync.
   * Preserves tombstones by soft-deleting records.
   */
  async applyChanges(data: {
    accounts: ChangeSet<ImportedAccount>
    journals: ChangeSet<ImportedJournal>
    transactions: ChangeSet<ImportedTransaction>
    auditLogs?: ChangeSet<ImportedAuditLog>
  }): Promise<void> {
    await database.write(async () => {
      const accountsCollection = database.collections.get<Account>('accounts')
      const journalsCollection = database.collections.get<Journal>('journals')
      const transactionsCollection = database.collections.get<Transaction>('transactions')
      const auditLogsCollection = database.collections.get<AuditLog>('audit_logs')

      const ops: any[] = []

      const upsert = async <T extends { id: string }>(
        collection: any,
        records: T[],
        prepare: (record: any, data: T) => void
      ) => {
        if (records.length === 0) return
        const ids = records.map(r => r.id)
        const existing = await collection.query(Q.where('id', Q.oneOf(ids))).fetch()
        const existingById = new Map(existing.map((r: any) => [r.id, r]))

        for (const rec of records) {
          const existingRecord = existingById.get(rec.id)
          if (existingRecord) {
            ops.push((existingRecord as any).prepareUpdate((record: any) => {
              prepare(record, rec)
              record._raw._status = 'synced'
            }))
          } else {
            ops.push(collection.prepareCreate((record: any) => {
              record._raw.id = rec.id
              prepare(record, rec)
              record._raw._status = 'synced'
            }))
          }
        }
      }

      const softDelete = async (collection: any, ids: string[]) => {
        if (ids.length === 0) return
        const existing = await collection.query(Q.where('id', Q.oneOf(ids))).fetch()
        const now = Date.now()
        for (const record of existing) {
          ops.push(record.prepareUpdate((r: any) => {
            r._raw.deleted_at = now
            r._raw.updated_at = now
            r._raw._status = 'synced'
          }))
        }
      }

      const hardDelete = async (collection: any, ids: string[]) => {
        if (ids.length === 0) return
        const existing = await collection.query(Q.where('id', Q.oneOf(ids))).fetch()
        for (const record of existing) {
          ops.push(record.prepareDestroyPermanently())
        }
      }

      await upsert(accountsCollection, [
        ...(data.accounts.created || []),
        ...(data.accounts.updated || [])
      ], (record: Account, acc: ImportedAccount) => {
        record.name = acc.name
        record.accountType = acc.accountType as any
        record.currencyCode = acc.currencyCode
        record.parentAccountId = acc.parentAccountId
        record.description = acc.description
        record.icon = acc.icon
        record.orderNum = acc.orderNum
        if (acc.createdAt) (record as any)._raw.created_at = acc.createdAt
        if (acc.updatedAt) (record as any)._raw.updated_at = acc.updatedAt
        if (acc.deletedAt) {
          (record as any)._raw.deleted_at = acc.deletedAt
        } else {
          (record as any)._raw.deleted_at = null
        }
      })

      await upsert(journalsCollection, [
        ...(data.journals.created || []),
        ...(data.journals.updated || [])
      ], (record: Journal, j: ImportedJournal) => {
        record.journalDate = j.journalDate
        record.description = j.description
        record.currencyCode = j.currencyCode
        record.status = j.status as any
        record.originalJournalId = j.originalJournalId
        record.reversingJournalId = j.reversingJournalId
        record.totalAmount = j.totalAmount
        record.transactionCount = j.transactionCount
        record.displayType = j.displayType
        if (j.createdAt) (record as any)._raw.created_at = j.createdAt
        if (j.updatedAt) (record as any)._raw.updated_at = j.updatedAt
        if (j.deletedAt) {
          (record as any)._raw.deleted_at = j.deletedAt
        } else {
          (record as any)._raw.deleted_at = null
        }
      })

      await upsert(transactionsCollection, [
        ...(data.transactions.created || []),
        ...(data.transactions.updated || [])
      ], (record: Transaction, t: ImportedTransaction) => {
        record.journalId = t.journalId
        record.accountId = t.accountId
        record.amount = t.amount
        record.transactionType = t.transactionType as any
        record.currencyCode = t.currencyCode
        record.transactionDate = t.transactionDate
        record.notes = t.notes
        record.exchangeRate = t.exchangeRate
        if (t.createdAt) (record as any)._raw.created_at = t.createdAt
        if (t.updatedAt) (record as any)._raw.updated_at = t.updatedAt
        if (t.deletedAt) {
          (record as any)._raw.deleted_at = t.deletedAt
        } else {
          (record as any)._raw.deleted_at = null
        }
      })

      if (data.auditLogs) {
        await upsert(auditLogsCollection, [
          ...(data.auditLogs.created || []),
          ...(data.auditLogs.updated || [])
        ], (record: AuditLog, log: ImportedAuditLog) => {
          record.entityType = log.entityType
          record.entityId = log.entityId
          record.action = log.action as any
          record.changes = log.changes
          record.timestamp = log.timestamp
          if (log.createdAt) (record as any)._raw.created_at = log.createdAt
        })
      }

      await softDelete(accountsCollection, data.accounts.deleted || [])
      await softDelete(journalsCollection, data.journals.deleted || [])

      const createdOrUpdatedTransactions = [
        ...(data.transactions.created || []),
        ...(data.transactions.updated || [])
      ]
      const txDates: number[] = createdOrUpdatedTransactions
        .map(t => t.transactionDate)
        .filter((date): date is number => typeof date === 'number')

      const deletedTransactionIds = data.transactions.deleted || []
      const deletedTxAccountIds = new Set<string>()
      if (deletedTransactionIds.length > 0) {
        const deletedTxs = await transactionsCollection
          .query(Q.where('id', Q.oneOf(deletedTransactionIds)))
          .fetch()
        for (const tx of deletedTxs) {
          deletedTxAccountIds.add(tx.accountId)
          if (typeof tx.transactionDate === 'number') {
            txDates.push(tx.transactionDate)
          }
        }
      }

      await softDelete(transactionsCollection, deletedTransactionIds)
      if (data.auditLogs) {
        await hardDelete(auditLogsCollection, data.auditLogs.deleted || [])
      }

      if (ops.length > 0) {
        await database.batch(...ops)
      }

      const txAccountIds = createdOrUpdatedTransactions.map(t => t.accountId)
      const allAffectedAccountIds = new Set<string>([...txAccountIds, ...deletedTxAccountIds])
      if (allAffectedAccountIds.size > 0) {
        const { rebuildQueueService } = require('@/src/services/RebuildQueueService')
        const earliestDate = txDates.length > 0 ? Math.min(...txDates) : undefined
        if (earliestDate !== undefined) {
          rebuildQueueService.enqueueMany(allAffectedAccountIds, earliestDate)
        } else {
          rebuildQueueService.enqueueMany(allAffectedAccountIds)
        }
      }
    })
  }
}

export const importRepository = new ImportRepository()
