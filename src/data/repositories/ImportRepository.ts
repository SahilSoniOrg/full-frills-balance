import { database } from '@/src/data/database/Database'
import Account, {
  AccountSubtype,
  AccountType,
  getDefaultSubtypeForTypeLike,
  isAccountSubtype,
  isAccountType
} from '@/src/data/models/Account'
import AccountMetadata from '@/src/data/models/AccountMetadata'
import AuditLog, { AuditAction, AuditEntityType } from '@/src/data/models/AuditLog'
import BalanceSnapshot from '@/src/data/models/BalanceSnapshot'
import Budget from '@/src/data/models/Budget'
import BudgetScope from '@/src/data/models/BudgetScope'
import Currency from '@/src/data/models/Currency'
import ExchangeRate from '@/src/data/models/ExchangeRate'
import Journal, { JournalStatus } from '@/src/data/models/Journal'
import JournalMetadata from '@/src/data/models/JournalMetadata'
import PlannedPayment from '@/src/data/models/PlannedPayment'
import SmsAutoPostRule from '@/src/data/models/SmsAutoPostRule'
import SmsInboxRecord, { SmsDirection, SmsParseStatus, SmsProcessingStatus } from '@/src/data/models/SmsInboxRecord'
import Transaction, { TransactionType } from '@/src/data/models/Transaction'
import { Q } from '@nozbe/watermelondb'

export interface ImportedAccount {
  id: string
  name: string
  accountType: AccountType | string
  accountSubtype?: AccountSubtype | string
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
  plannedPaymentId?: string
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
  entityType: AuditEntityType
  entityId: string
  action: string
  changes: string
  timestamp: number
  createdAt?: number
}

export interface ImportedBudget {
  id: string
  name: string
  amount: number
  currencyCode: string
  startMonth: string
  active: boolean
  createdAt?: number
  updatedAt?: number
}

export interface ImportedBudgetScope {
  id: string
  budgetId: string
  accountId: string
  createdAt?: number
  updatedAt?: number
}

export interface ImportedCurrency {
  id: string
  code: string
  symbol: string
  name: string
  precision: number
  createdAt?: number
  updatedAt?: number
  deletedAt?: number
}

export interface ImportedExchangeRate {
  id: string
  fromCurrency: string
  toCurrency: string
  rate: number
  effectiveDate: number
  source: string
  createdAt?: number
  updatedAt?: number
}

export interface ImportedAccountMetadata {
  id: string
  accountId: string
  statementDay?: number
  dueDay?: number
  minimumPaymentAmount?: number
  minimumBalanceAmount?: number
  creditLimitAmount?: number
  aprBps?: number
  emiDay?: number
  loanTenureMonths?: number
  autopayEnabled?: boolean
  gracePeriodDays?: number
  notes?: string
  createdAt?: number
  updatedAt?: number
}

export interface ImportedPlannedPayment {
  id: string
  name: string
  description?: string
  amount: number
  currencyCode: string
  fromAccountId: string
  toAccountId: string
  intervalN: number
  intervalType: string
  startDate: number
  endDate?: number
  nextOccurrence: number
  status: string
  isAutoPost: boolean
  recurrenceDay?: number
  recurrenceMonth?: number
  createdAt?: number
  updatedAt?: number
  deletedAt?: number
}

export interface ImportedJournalMetadata {
  id: string
  journalId: string
  importSource: string
  originalSmsId?: string
  originalSmsSender?: string
  originalSmsBody?: string
  metadataJson?: string
  createdAt?: number
  updatedAt?: number
}

export interface ImportedSmsInboxRecord {
  id: string
  deviceSmsId: string
  senderAddress: string
  rawBody: string
  smsDate: number
  smsFingerprint: string
  parseStatus: string
  parsedAmount?: number
  parsedCurrencyCode?: string
  parsedMerchant?: string
  parsedAccountSource?: string
  referenceNumber?: string
  direction: string
  processingStatus: string
  linkedJournalId?: string
  duplicateJournalId?: string
  duplicateConfidence?: number
  parseConfidence?: number
  parseReason?: string
  metadataJson?: string
  firstSeenAt: number
  lastScannedAt: number
  processedAt?: number
  createdAt?: number
  updatedAt?: number
}

export interface ImportedSmsAutoPostRule {
  id: string
  senderMatch: string
  bodyMatch?: string
  conditionsJson?: string
  actionsJson?: string
  priority?: number
  sourceAccountId: string
  categoryAccountId: string
  isActive: boolean
  createdAt?: number
  updatedAt?: number
}

export interface ImportedBalanceSnapshot {
  id: string
  accountId: string
  transactionId: string
  transactionDate: number
  absoluteBalance: number
  transactionCount: number
  createdAt?: number
  updatedAt?: number
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
  budgets?: ImportedBudget[]
  budgetScopes?: ImportedBudgetScope[]
  auditLogs?: ImportedAuditLog[]
  currencies?: ImportedCurrency[]
  exchangeRates?: ImportedExchangeRate[]
  accountMetadata?: ImportedAccountMetadata[]
  plannedPayments?: ImportedPlannedPayment[]
  journalMetadata?: ImportedJournalMetadata[]
  smsAutoPostRules?: ImportedSmsAutoPostRule[]
  smsInboxRecords?: ImportedSmsInboxRecord[]
  balanceSnapshots?: ImportedBalanceSnapshot[]
}

const DEFAULT_ACCOUNT_TYPE = AccountType.ASSET

function toAccountType(value: AccountType | string): AccountType {
  return isAccountType(value) ? value : DEFAULT_ACCOUNT_TYPE
}

function toAccountSubtype(value?: AccountSubtype | string): AccountSubtype | undefined {
  if (!value) return undefined
  return isAccountSubtype(value) ? value : undefined
}

function pickImportedSubtype(account: ImportedAccount): AccountSubtype | undefined {
  return toAccountSubtype(account.accountSubtype) ?? getDefaultSubtypeForTypeLike(account.accountType)
}

function toJournalStatus(value: string): JournalStatus {
  const statuses = Object.values(JournalStatus)
  return statuses.includes(value as JournalStatus) ? (value as JournalStatus) : JournalStatus.POSTED
}

function toTransactionType(value: string): TransactionType {
  const types = Object.values(TransactionType)
  return types.includes(value as TransactionType) ? (value as TransactionType) : TransactionType.DEBIT
}

function toAuditAction(value: string): AuditAction {
  const actions = Object.values(AuditAction)
  return actions.includes(value as AuditAction) ? (value as AuditAction) : AuditAction.UPDATE
}

function toSmsParseStatus(value: string): SmsParseStatus {
  return Object.values(SmsParseStatus).includes(value as SmsParseStatus)
    ? (value as SmsParseStatus)
    : SmsParseStatus.PARSE_FAILED
}

function toSmsProcessingStatus(value: string): SmsProcessingStatus {
  return Object.values(SmsProcessingStatus).includes(value as SmsProcessingStatus)
    ? (value as SmsProcessingStatus)
    : SmsProcessingStatus.PENDING
}

function toSmsDirection(value: string): SmsDirection {
  return Object.values(SmsDirection).includes(value as SmsDirection)
    ? (value as SmsDirection)
    : SmsDirection.UNKNOWN
}

export class ImportRepository {
  async batchInsert(data: BatchImportData): Promise<void> {
    await database.write(async () => {
      const accountsCollection = database.collections.get<Account>('accounts')
      const journalsCollection = database.collections.get<Journal>('journals')
      const transactionsCollection = database.collections.get<Transaction>('transactions')
      const auditLogsCollection = database.collections.get<AuditLog>('audit_logs')
      const currenciesCollection = database.collections.get<Currency>('currencies')
      const exchangeRatesCollection = database.collections.get<ExchangeRate>('exchange_rates')
      const accountMetadataCollection = database.collections.get<AccountMetadata>('account_metadata')
      const plannedPaymentsCollection = database.collections.get<PlannedPayment>('planned_payments')
      const journalMetadataCollection = database.collections.get<JournalMetadata>('journal_metadata')
      const smsAutoPostRulesCollection = database.collections.get<SmsAutoPostRule>('sms_auto_post_rules')
      const smsInboxCollection = database.collections.get<SmsInboxRecord>('sms_inbox_records')
      const balanceSnapshotsCollection = database.collections.get<BalanceSnapshot>('balance_snapshots')

      const accountPrepares = data.accounts.map(acc =>
        accountsCollection.prepareCreate(record => {
          record._raw.id = acc.id
          record.name = acc.name
          record.accountType = toAccountType(acc.accountType)
          record.accountSubtype = pickImportedSubtype(acc)
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
          record.status = toJournalStatus(j.status)
          record.originalJournalId = j.originalJournalId
          record.reversingJournalId = j.reversingJournalId
          record.totalAmount = j.totalAmount
          record.transactionCount = j.transactionCount
          record.displayType = j.displayType
          if (j.plannedPaymentId) record.plannedPaymentId = j.plannedPaymentId
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
          record.transactionType = toTransactionType(t.transactionType)
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
          record.action = toAuditAction(log.action)
          record.changes = log.changes
          record.timestamp = log.timestamp
          record._raw._status = 'synced'
          if (log.createdAt) (record as any)._raw.created_at = log.createdAt
        })
      )

      const budgetPrepares = (data.budgets || []).map((b) =>
        database.collections.get<Budget>('budgets').prepareCreate(record => {
          record._raw.id = b.id
          record.name = b.name
          record.amount = b.amount
          record.currencyCode = b.currencyCode
          record.startMonth = b.startMonth
          record.active = b.active
          record._raw._status = 'synced'
          if (b.createdAt) (record as any)._raw.created_at = b.createdAt
          if (b.updatedAt) (record as any)._raw.updated_at = b.updatedAt
        })
      )

      const budgetScopePrepares = (data.budgetScopes || []).map((bs) =>
        database.collections.get<BudgetScope>('budget_scopes').prepareCreate(record => {
          record._raw.id = bs.id
            ; (record as any)._raw.budget_id = bs.budgetId
            ; (record as any)._raw.account_id = bs.accountId
          record._raw._status = 'synced'
          if (bs.createdAt) (record as any)._raw.created_at = bs.createdAt
          if (bs.updatedAt) (record as any)._raw.updated_at = bs.updatedAt
        })
      )

      const currencyPrepares = (data.currencies || []).map((c) =>
        currenciesCollection.prepareCreate(record => {
          record._raw.id = c.id
          record.code = c.code
          record.symbol = c.symbol
          record.name = c.name
          record.precision = c.precision
          record._raw._status = 'synced'
          if (c.createdAt) (record as any)._raw.created_at = c.createdAt
          if (c.updatedAt) (record as any)._raw.updated_at = c.updatedAt
          if (c.deletedAt) (record as any)._raw.deleted_at = c.deletedAt
        })
      )

      const exchangeRatePrepares = (data.exchangeRates || []).map((er) =>
        exchangeRatesCollection.prepareCreate(record => {
          record._raw.id = er.id
          record.fromCurrency = er.fromCurrency
          record.toCurrency = er.toCurrency
          record.rate = er.rate
          record.effectiveDate = er.effectiveDate
          record.source = er.source
          record._raw._status = 'synced'
          if (er.createdAt) (record as any)._raw.created_at = er.createdAt
          if (er.updatedAt) (record as any)._raw.updated_at = er.updatedAt
        })
      )

      const accountMetadataPrepares = (data.accountMetadata || []).map((metadata) =>
        accountMetadataCollection.prepareCreate(record => {
          record._raw.id = metadata.id
            ; (record as any)._raw.account_id = metadata.accountId
          record.statementDay = metadata.statementDay
          record.dueDay = metadata.dueDay
          record.minimumPaymentAmount = metadata.minimumPaymentAmount
          record.minimumBalanceAmount = metadata.minimumBalanceAmount
          record.creditLimitAmount = metadata.creditLimitAmount
          record.aprBps = metadata.aprBps
          record.emiDay = metadata.emiDay
          record.loanTenureMonths = metadata.loanTenureMonths
          record.autopayEnabled = metadata.autopayEnabled
          record.gracePeriodDays = metadata.gracePeriodDays
          record.notes = metadata.notes
          record._raw._status = 'synced'
          if (metadata.createdAt) (record as any)._raw.created_at = metadata.createdAt
          if (metadata.updatedAt) (record as any)._raw.updated_at = metadata.updatedAt
        })
      )

      const plannedPaymentPrepares = (data.plannedPayments || []).map((pp) =>
        plannedPaymentsCollection.prepareCreate((record) => {
          record._raw.id = pp.id
          record.name = pp.name
          record.description = pp.description
          record.amount = pp.amount
          record.currencyCode = pp.currencyCode
          record.fromAccountId = pp.fromAccountId
          record.toAccountId = pp.toAccountId
          record.intervalN = pp.intervalN
          record.intervalType = pp.intervalType as any
          record.startDate = pp.startDate
          record.endDate = pp.endDate
          record.nextOccurrence = pp.nextOccurrence
          record.status = pp.status as any
          record.isAutoPost = pp.isAutoPost
          record.recurrenceDay = pp.recurrenceDay
          record.recurrenceMonth = pp.recurrenceMonth
          record._raw._status = 'synced'
          if (pp.createdAt) (record as any)._raw.created_at = pp.createdAt
          if (pp.updatedAt) (record as any)._raw.updated_at = pp.updatedAt
          if (pp.deletedAt) (record as any)._raw.deleted_at = pp.deletedAt
        })
      )

      const journalMetadataPrepares = (data.journalMetadata || []).map((meta) =>
        journalMetadataCollection.prepareCreate((record) => {
          record._raw.id = meta.id
            ; (record as any)._raw.journal_id = meta.journalId
          record.importSource = meta.importSource
          record.originalSmsId = meta.originalSmsId
          record.originalSmsSender = meta.originalSmsSender
          record.originalSmsBody = meta.originalSmsBody
          record.metadataJson = meta.metadataJson
          record._raw._status = 'synced'
          if (meta.createdAt) (record as any)._raw.created_at = meta.createdAt
          if (meta.updatedAt) (record as any)._raw.updated_at = meta.updatedAt
        })
      )

      const smsAutoPostRulePrepares = (data.smsAutoPostRules || []).map((rule) =>
        smsAutoPostRulesCollection.prepareCreate((record) => {
          record._raw.id = rule.id
          record.senderMatch = rule.senderMatch
          record.bodyMatch = rule.bodyMatch
          record.conditionsJson = rule.conditionsJson
          record.actionsJson = rule.actionsJson
          record.priority = rule.priority
          record.sourceAccountId = rule.sourceAccountId
          record.categoryAccountId = rule.categoryAccountId
          record.isActive = rule.isActive
          record._raw._status = 'synced'
          if (rule.createdAt) (record as any)._raw.created_at = rule.createdAt
          if (rule.updatedAt) (record as any)._raw.updated_at = rule.updatedAt
        })
      )

      const smsInboxPrepares = (data.smsInboxRecords || []).map((sms) =>
        smsInboxCollection.prepareCreate((record) => {
          record._raw.id = sms.id
          record.deviceSmsId = sms.deviceSmsId
          record.senderAddress = sms.senderAddress
          record.rawBody = sms.rawBody
          record.smsDate = sms.smsDate
          record.smsFingerprint = sms.smsFingerprint
          record.parseStatus = toSmsParseStatus(sms.parseStatus)
          record.parsedAmount = sms.parsedAmount
          record.parsedCurrencyCode = sms.parsedCurrencyCode
          record.parsedMerchant = sms.parsedMerchant
          record.parsedAccountSource = sms.parsedAccountSource
          record.referenceNumber = sms.referenceNumber
          record.direction = toSmsDirection(sms.direction)
          record.processingStatus = toSmsProcessingStatus(sms.processingStatus)
          record.linkedJournalId = sms.linkedJournalId
          record.duplicateJournalId = sms.duplicateJournalId
          record.duplicateConfidence = sms.duplicateConfidence
          record.parseConfidence = sms.parseConfidence
          record.parseReason = sms.parseReason
          record.metadataJson = sms.metadataJson
          record.firstSeenAt = sms.firstSeenAt
          record.lastScannedAt = sms.lastScannedAt
          record.processedAt = sms.processedAt
          record._raw._status = 'synced'
          if (sms.createdAt) (record as any)._raw.created_at = sms.createdAt
          if (sms.updatedAt) (record as any)._raw.updated_at = sms.updatedAt
        })
      )

      const balanceSnapshotPrepares = (data.balanceSnapshots || []).map((bs) =>
        balanceSnapshotsCollection.prepareCreate((record) => {
          record._raw.id = bs.id
            ; (record as any)._raw.account_id = bs.accountId
            ; (record as any)._raw.transaction_id = bs.transactionId
          record.transactionDate = bs.transactionDate
          record.absoluteBalance = bs.absoluteBalance
          record.transactionCount = bs.transactionCount
          record._raw._status = 'synced'
          if (bs.createdAt) (record as any)._raw.created_at = bs.createdAt
          if (bs.updatedAt) (record as any)._raw.updated_at = bs.updatedAt
        })
      )

      const operations = [
        ...accountPrepares,
        ...journalPrepares,
        ...transactionPrepares,
        ...auditLogPrepares,
        ...budgetPrepares,
        ...budgetScopePrepares,
        ...currencyPrepares,
        ...exchangeRatePrepares,
        ...accountMetadataPrepares,
        ...plannedPaymentPrepares,
        ...journalMetadataPrepares,
        ...smsAutoPostRulePrepares,
        ...smsInboxPrepares,
        ...balanceSnapshotPrepares
      ]

      if (operations.length > 0) {
        await database.batch(...operations)
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
        record.accountType = toAccountType(acc.accountType)
        record.accountSubtype = pickImportedSubtype(acc)
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
        record.status = toJournalStatus(j.status)
        record.originalJournalId = j.originalJournalId
        record.reversingJournalId = j.reversingJournalId
        record.totalAmount = j.totalAmount
        record.transactionCount = j.transactionCount
        record.displayType = j.displayType
        if (j.plannedPaymentId) {
          record.plannedPaymentId = j.plannedPaymentId
        }
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
        record.transactionType = toTransactionType(t.transactionType)
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
          record.action = toAuditAction(log.action)
          record.changes = log.changes
          record.timestamp = log.timestamp
          if (log.createdAt) (record as any)._raw.created_at = log.createdAt
        })
      }

      await softDelete(accountsCollection, data.accounts.deleted || [])
      await softDelete(journalsCollection, data.journals.deleted || [])

      const deletedTransactionIds = data.transactions.deleted || []
      await softDelete(transactionsCollection, deletedTransactionIds)

      if (data.auditLogs) {
        await hardDelete(auditLogsCollection, data.auditLogs.deleted || [])
      }

      if (ops.length > 0) {
        await database.batch(...ops)
      }
    })
  }
}

export const importRepository = new ImportRepository()
