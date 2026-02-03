import { database } from '@/src/data/database/Database'
import Account from '@/src/data/models/Account'
import AuditLog from '@/src/data/models/AuditLog'
import Journal from '@/src/data/models/Journal'
import Transaction from '@/src/data/models/Transaction'

export interface ImportedAccount {
  id: string
  name: string
  accountType: string
  currencyCode: string
  parentAccountId?: string
  description?: string
  orderNum?: number
  createdAt?: number
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
          record.orderNum = acc.orderNum
          record._raw._status = 'synced'
          if (acc.createdAt) (record as any)._raw.created_at = acc.createdAt
        })
      )

      const journalPrepares = data.journals.map(j =>
        journalsCollection.prepareCreate(record => {
          record._raw.id = j.id
          record.journalDate = j.journalDate
          record.description = j.description
          record.currencyCode = j.currencyCode
          record.status = j.status as any
          record.totalAmount = j.totalAmount
          record.transactionCount = j.transactionCount
          record.displayType = j.displayType
          record._raw._status = 'synced'
          if (j.createdAt) (record as any)._raw.created_at = j.createdAt
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
    })
  }
}

export const importRepository = new ImportRepository()
