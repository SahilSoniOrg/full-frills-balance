import ExpoSmsInboxModule, { SmsMessage } from '@/modules/expo-sms-inbox'
import { AppConfig } from '@/src/constants'
import { database } from '@/src/data/database/Database'
import { AccountType } from '@/src/data/models/Account'
import { JournalStatus } from '@/src/data/models/Journal'
import SmsAutoPostRule from '@/src/data/models/SmsAutoPostRule'
import SmsInboxRecord, {
  SmsDirection,
  SmsParseStatus,
  SmsProcessingStatus,
} from '@/src/data/models/SmsInboxRecord'
import { TransactionType } from '@/src/data/models/Transaction'
import { accountRepository } from '@/src/data/repositories/AccountRepository'
import { journalRepository } from '@/src/data/repositories/JournalRepository'
import { ledgerWriteService } from '@/src/services/ledger'
import { logger } from '@/src/utils/logger'
import { preferences } from '@/src/utils/preferences'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Q } from '@nozbe/watermelondb'
import { PermissionsAndroid, Platform } from 'react-native'

export interface ParsedTransaction {
  id: string
  amount?: number
  merchant?: string
  type: 'debit' | 'credit' | 'unknown'
  date: number
  rawBody: string
  address: string
  accountSource?: string
  referenceNumber?: string
  currencyCode?: string
  confidence: number
  parseStatus: SmsParseStatus
  parseReason: string
}

export interface SmsInboxFilterOptions {
  status?: 'pending' | 'processed' | 'auto_posted' | 'duplicates' | 'failed'
}

export interface SmsSyncResult {
  cursor: number
  importedCount: number
}

export interface SmsRuleSuggestion {
  senderMatch: string
  bodyMatch?: string
  sourceAccountId: string
  categoryAccountId: string
  sourceAccountName: string
  categoryAccountName: string
  sampleCount: number
  sampleMerchants: string[]
}

export type SmsRuleMode = 'builder' | 'regex'
export type SmsRuleDisposition = 'auto_post' | 'review' | 'ignore'
export type SmsRuleField = 'sender' | 'body' | 'merchant' | 'account_source' | 'direction' | 'currency' | 'amount'
export type SmsRuleStringOperator = 'contains' | 'is'
export type SmsRuleAmountOperator = 'eq' | 'gt' | 'lt' | 'between'

export interface SmsRuleCondition {
  field: SmsRuleField
  operator: SmsRuleStringOperator | SmsRuleAmountOperator | 'is'
  value?: string
  minValue?: number
  maxValue?: number
}

export interface SmsRuleActions {
  disposition: SmsRuleDisposition
  sourceAccountId?: string
  categoryAccountId?: string
}

export interface SmsRuleDraftInput {
  id?: string
  mode: SmsRuleMode
  senderMatch?: string
  bodyMatch?: string
  conditions?: SmsRuleCondition[]
  actions: SmsRuleActions
  isActive: boolean
  priority?: number
}

export interface SmsRulePreviewInput {
  mode: SmsRuleMode
  senderMatch?: string
  bodyMatch?: string
  conditions?: SmsRuleCondition[]
}

type ResolvedSmsRule = {
  mode: SmsRuleMode
  senderMatch?: string
  bodyMatch?: string
  conditions: SmsRuleCondition[]
  actions: SmsRuleActions
  priority: number
}

type DuplicateMatch = {
  journalId: string
  score: number
  reasons: string[]
} | null

class SmsService {
  private readonly PROCESSED_SMS_KEY = '@processed_sms_ids'
  private readonly DAY_WINDOW_MS = 24 * 60 * 60 * 1000

  private get rules() {
    return database.collections.get<SmsAutoPostRule>('sms_auto_post_rules')
  }

  private get inbox() {
    return database.collections.get<SmsInboxRecord>('sms_inbox_records')
  }

  async getLatestMessages(limit: number = AppConfig.pagination.smsImportScanLimit): Promise<SmsMessage[]> {
    if (Platform.OS !== 'android') {
      throw new Error('Reading SMS is only supported on Android.')
    }

    const hasPermission = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS)
    if (!hasPermission) {
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_SMS, {
        title: 'SMS Permission',
        message: 'Full Frills Balance needs access to read your SMS to import transactions securely.',
        buttonNeutral: 'Ask Me Later',
        buttonNegative: AppConfig.strings.common.cancel,
        buttonPositive: 'OK',
      })

      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        throw new Error('READ_SMS permission denied by user.')
      }
    }

    if (!ExpoSmsInboxModule) {
      throw new Error('ExpoSmsInbox module is not available')
    }

    return ExpoSmsInboxModule.getSmsInbox(limit)
  }

  async scanRecentSmsPage(pageSize: number = AppConfig.pagination.smsImportScanLimit): Promise<SmsSyncResult> {
    const importedCount = await this.scanInbox(pageSize)
    return { cursor: pageSize, importedCount }
  }

  async scanOlderSmsPage(cursor: number, pageSize: number = AppConfig.pagination.smsImportScanLimit): Promise<SmsSyncResult> {
    const nextCursor = cursor + pageSize
    const importedCount = await this.scanInbox(nextCursor)
    return { cursor: nextCursor, importedCount }
  }

  async refreshLatestSms(pageSize: number = AppConfig.pagination.smsImportScanLimit): Promise<SmsSyncResult> {
    const importedCount = await this.scanInbox(pageSize)
    return { cursor: pageSize, importedCount }
  }

  observeInbox(limit: number, filter?: SmsInboxFilterOptions) {
    const clauses: any[] = [Q.sortBy('sms_date', Q.desc), Q.take(limit)]
    const statuses = this.getProcessingStatusesForFilter(filter?.status)
    if (statuses.length > 0) {
      clauses.unshift(Q.where('processing_status', Q.oneOf(statuses)))
    }

    return this.inbox
      .query(...clauses)
      .observeWithColumns([
        'processing_status',
        'parse_status',
        'parsed_amount',
        'parsed_currency_code',
        'parsed_merchant',
        'linked_journal_id',
        'duplicate_journal_id',
        'duplicate_confidence',
        'parse_reason',
        'processed_at',
        'sms_date',
      ])
  }

  async getInboxRecord(id: string): Promise<SmsInboxRecord | null> {
    try {
      return await this.inbox.find(id)
    } catch {
      return null
    }
  }

  async findByLinkedJournalId(journalId: string): Promise<SmsInboxRecord | null> {
    const records = await this.inbox.query(Q.where('linked_journal_id', journalId), Q.take(1)).fetch()
    return records[0] || null
  }

  async markInboxRecordStatus(id: string, status: SmsProcessingStatus): Promise<void> {
    const record = await this.getInboxRecord(id)
    if (!record) return

    await database.write(async () => {
      await record.update((entry) => {
        entry.processingStatus = status
        entry.processedAt = this.isProcessedStatus(status) ? Date.now() : undefined
      })
    })
  }

  async linkSmsToJournal(recordId: string, journalId: string, disposition: SmsProcessingStatus.IMPORTED | SmsProcessingStatus.AUTO_POSTED): Promise<void> {
    const record = await this.getInboxRecord(recordId)
    if (!record) return

    await database.write(async () => {
      await record.update((entry) => {
        entry.linkedJournalId = journalId
        entry.processingStatus = disposition
        entry.processedAt = Date.now()
      })
    })
  }

  async finalizeManualImport(recordId: string, journalId: string): Promise<void> {
    await this.linkSmsToJournal(recordId, journalId, SmsProcessingStatus.IMPORTED)
  }

  async clearProcessedMessages(): Promise<void> {
    await AsyncStorage.removeItem(this.PROCESSED_SMS_KEY)
  }

  async previewRuleMatches(inputOrSender: SmsRulePreviewInput | string, bodyMatch?: string): Promise<SmsInboxRecord[]> {
    const previewInput: SmsRulePreviewInput = typeof inputOrSender === 'string'
      ? { mode: 'regex', senderMatch: inputOrSender, bodyMatch }
      : inputOrSender

    const items = await this.inbox.query(Q.sortBy('sms_date', Q.desc), Q.take(50)).fetch()
    return items.filter((item) => this.matchesPreviewRule(item, previewInput)).slice(0, 5)
  }

  async getRuleSuggestions(): Promise<SmsRuleSuggestion[]> {
    const existingRules = await this.rules.query().fetch()
    const records = await this.inbox
      .query(
        Q.where('linked_journal_id', Q.notEq(null)),
        Q.where('processing_status', Q.oneOf([SmsProcessingStatus.IMPORTED, SmsProcessingStatus.AUTO_POSTED])),
        Q.sortBy('sms_date', Q.desc),
        Q.take(200)
      )
      .fetch()

    const grouped = new Map<string, {
      senderAddress: string
      merchant?: string
      accountSource?: string
      journalIds: string[]
      count: number
    }>()

    for (const record of records) {
      const key = `${record.senderAddress.toUpperCase()}::${(record.parsedMerchant || '').toUpperCase()}`
      const current = grouped.get(key)
      if (current) {
        current.count += 1
        if (record.linkedJournalId) current.journalIds.push(record.linkedJournalId)
      } else {
        grouped.set(key, {
          senderAddress: record.senderAddress,
          merchant: record.parsedMerchant || undefined,
          accountSource: record.parsedAccountSource || undefined,
          journalIds: record.linkedJournalId ? [record.linkedJournalId] : [],
          count: 1,
        })
      }
    }

    const suggestions: SmsRuleSuggestion[] = []
    for (const group of grouped.values()) {
      if (group.count < 2 || group.journalIds.length < 2) continue
      const suggestion = await this.buildSuggestionFromHistory(group)
      if (!suggestion) continue

      const alreadyExists = existingRules.some((rule) =>
        rule.senderMatch === suggestion.senderMatch &&
        (rule.bodyMatch || '') === (suggestion.bodyMatch || '') &&
        rule.sourceAccountId === suggestion.sourceAccountId &&
        rule.categoryAccountId === suggestion.categoryAccountId
      )
      if (!alreadyExists) {
        suggestions.push(suggestion)
      }
    }

    return suggestions.sort((a, b) => b.sampleCount - a.sampleCount).slice(0, 5)
  }

  parseTransactionMessage(sms: SmsMessage): ParsedTransaction {
    const text = sms.body.toLowerCase()
    const isPhoneNumber = /^\+?\d{10,14}$/.test(sms.address)
    if (isPhoneNumber) {
      return {
        id: sms.id,
        type: 'unknown',
        date: sms.date,
        rawBody: sms.body,
        address: sms.address,
        confidence: 0,
        parseStatus: SmsParseStatus.IGNORED,
        parseReason: 'Personal sender address',
      }
    }

    const direction = this.classifyDirection(text)
    const currencyMatch = this.extractCurrencyAndAmount(sms.body)
    const merchant = this.extractMerchant(sms.body, direction)
    const accountSource = this.extractAccountSource(sms.body)
    const referenceNumber = this.extractReferenceNumber(sms.body)

    if (direction === SmsDirection.UNKNOWN) {
      return {
        id: sms.id,
        type: 'unknown',
        date: sms.date,
        rawBody: sms.body,
        address: sms.address,
        accountSource,
        referenceNumber,
        confidence: 0.2,
        parseStatus: SmsParseStatus.IGNORED,
        parseReason: 'Not classified as transaction-like',
      }
    }

    if (!currencyMatch) {
      return {
        id: sms.id,
        merchant,
        type: direction,
        date: sms.date,
        rawBody: sms.body,
        address: sms.address,
        accountSource,
        referenceNumber,
        confidence: 0.45,
        parseStatus: SmsParseStatus.PARSE_FAILED,
        parseReason: 'Could not find a supported amount',
      }
    }

    return {
      id: sms.id,
      amount: currencyMatch.amount,
      merchant,
      type: direction,
      date: sms.date,
      rawBody: sms.body,
      address: sms.address,
      accountSource,
      referenceNumber,
      currencyCode: currencyMatch.currencyCode || undefined,
      confidence: merchant ? 0.92 : 0.82,
      parseStatus: SmsParseStatus.PARSED,
      parseReason: currencyMatch.currencyCode ? 'Parsed transaction and currency hint' : 'Parsed transaction amount',
    }
  }

  async saveAutoPostRule(data: SmsRuleDraftInput) {
    const normalizedConditions = (data.conditions || []).filter((condition) => this.isMeaningfulCondition(condition))
    const normalizedActions: SmsRuleActions = {
      disposition: data.actions.disposition,
      sourceAccountId: data.actions.sourceAccountId || undefined,
      categoryAccountId: data.actions.categoryAccountId || undefined,
    }
    const senderFallback = data.mode === 'regex'
      ? (data.senderMatch || '')
      : normalizedConditions.find((condition) => condition.field === 'sender')?.value || 'structured'
    const bodyFallback = data.mode === 'regex'
      ? (data.bodyMatch || undefined)
      : normalizedConditions.find((condition) => condition.field === 'body')?.value

    await database.write(async () => {
      if (data.id) {
        const rule = await this.rules.find(data.id)
        await rule.update((record) => {
          record.senderMatch = senderFallback
          record.bodyMatch = bodyFallback
          record.conditionsJson = data.mode === 'builder' ? JSON.stringify(normalizedConditions) : undefined
          record.actionsJson = JSON.stringify(normalizedActions)
          record.priority = data.priority ?? 100
          record.sourceAccountId = normalizedActions.sourceAccountId || ''
          record.categoryAccountId = normalizedActions.categoryAccountId || ''
          record.isActive = data.isActive
        })
      } else {
        await this.rules.create((record) => {
          record.senderMatch = senderFallback
          record.bodyMatch = bodyFallback
          record.conditionsJson = data.mode === 'builder' ? JSON.stringify(normalizedConditions) : undefined
          record.actionsJson = JSON.stringify(normalizedActions)
          record.priority = data.priority ?? 100
          record.sourceAccountId = normalizedActions.sourceAccountId || ''
          record.categoryAccountId = normalizedActions.categoryAccountId || ''
          record.isActive = data.isActive
        })
      }
    })
  }

  async deleteAutoPostRule(id: string) {
    await database.write(async () => {
      const rule = await this.rules.find(id)
      await rule.destroyPermanently()
    })
  }

  private async scanInbox(limit: number): Promise<number> {
    const messages = await this.getLatestMessages(limit)
    if (messages.length === 0) {
      return 0
    }
    const activeRules = (await this.rules.query(Q.where('is_active', true)).fetch())
      .sort((a, b) => this.getRulePriority(b) - this.getRulePriority(a))
    const processedIds = new Set(await this.getProcessedSmsIds())
    const existing = await this.inbox.query(Q.where('device_sms_id', Q.oneOf(messages.map((message) => message.id)))).fetch()
    const existingMap = new Map(existing.map((record) => [record.deviceSmsId, record]))

    let importedCount = 0

    for (const message of messages) {
      const parsed = this.parseTransactionMessage(message)
      if (parsed.parseStatus === SmsParseStatus.IGNORED) {
        continue
      }

      const smsFingerprint = this.computeSmsFingerprint(message.address, message.body, message.date)
      const exactJournal = await journalRepository.findJournalByOriginalSmsId(message.id)
      const fingerprintJournal = exactJournal ? null : await journalRepository.findJournalBySmsFingerprint(smsFingerprint)
      const duplicate = parsed.parseStatus === SmsParseStatus.PARSED && parsed.amount
        ? await this.findDuplicateCandidatesForParsed(parsed)
        : null
      const existingRecord = existingMap.get(message.id) || null
      const nextStatus = this.resolveProcessingStatus({
        parsed,
        processedIds,
        exactJournalId: exactJournal?.id || fingerprintJournal?.id,
        duplicate,
        existingStatus: existingRecord?.processingStatus,
      })

      const record = await this.upsertInboxRecord(message, parsed, smsFingerprint, existingRecord, nextStatus, exactJournal?.id || fingerprintJournal?.id, duplicate)

      if (parsed.parseStatus === SmsParseStatus.PARSED && nextStatus === SmsProcessingStatus.PENDING) {
        const ruleResult = await this.tryAutoPostRecord(record, parsed, activeRules)
        if (ruleResult === 'auto_posted') {
          importedCount += 1
        }
      }
    }

    return importedCount
  }

  private async tryAutoPostRecord(
    record: SmsInboxRecord,
    parsed: ParsedTransaction,
    activeRules: SmsAutoPostRule[]
  ): Promise<'auto_posted' | 'ignored' | 'review' | 'none'> {
    if (activeRules.length === 0 || !parsed.amount) return 'none'

    for (const rule of activeRules) {
      const definition = this.getRuleDefinition(rule)
      if (!this.matchesResolvedRule(record, definition)) {
        continue
      }

      if (definition.actions.disposition === 'ignore') {
        await this.markInboxRecordStatus(record.id, SmsProcessingStatus.DISMISSED)
        await this.markSmsAsProcessed(record.deviceSmsId)
        return 'ignored'
      }

      if (definition.actions.disposition === 'review') {
        return 'review'
      }

      if (!definition.actions.sourceAccountId || !definition.actions.categoryAccountId) {
        return 'none'
      }

      const currencyCode = preferences.defaultCurrencyCode || AppConfig.defaultCurrency
      const isExpense = parsed.type === 'debit'
      const journal = await ledgerWriteService.createJournal({
        journalDate: parsed.date || Date.now(),
        description: parsed.merchant ? `Auto-Posted: ${parsed.merchant}` : 'Auto-Posted SMS Transaction',
        currencyCode,
        status: JournalStatus.POSTED,
        metadata: {
          importSource: 'sms',
          originalSmsId: parsed.id,
          originalSmsSender: parsed.address,
          originalSmsBody: parsed.rawBody,
          metadataJson: JSON.stringify({
            smsFingerprint: record.smsFingerprint,
            parsedAmount: parsed.amount,
            parsedCurrencyCode: parsed.currencyCode || null,
            parsedMerchant: parsed.merchant || null,
            referenceNumber: parsed.referenceNumber || null,
            accountSource: parsed.accountSource || null,
          }),
        },
        transactions: [
          {
            accountId: definition.actions.sourceAccountId,
            amount: parsed.amount,
            transactionType: isExpense ? TransactionType.CREDIT : TransactionType.DEBIT,
            currencyCode,
          },
          {
            accountId: definition.actions.categoryAccountId,
            amount: parsed.amount,
            transactionType: isExpense ? TransactionType.DEBIT : TransactionType.CREDIT,
            currencyCode,
          },
        ],
      })

      await this.linkSmsToJournal(record.id, journal.id, SmsProcessingStatus.AUTO_POSTED)
      await this.markSmsAsProcessed(record.deviceSmsId)
      return 'auto_posted'
    }

    return 'none'
  }

  private async upsertInboxRecord(
    sms: SmsMessage,
    parsed: ParsedTransaction,
    smsFingerprint: string,
    existing: SmsInboxRecord | null,
    processingStatus: SmsProcessingStatus,
    linkedJournalId?: string,
    duplicate?: DuplicateMatch
  ): Promise<SmsInboxRecord> {
    const now = Date.now()
    const metadataJson = JSON.stringify({
      duplicateReasons: duplicate?.reasons || [],
      smsFingerprint,
      parsedAmount: parsed.amount ?? null,
      parsedCurrencyCode: parsed.currencyCode ?? null,
      parsedMerchant: parsed.merchant ?? null,
      referenceNumber: parsed.referenceNumber ?? null,
      parsedAccountSource: parsed.accountSource ?? null,
    })

    if (existing) {
      await database.write(async () => {
        await existing.update((entry) => {
          entry.senderAddress = sms.address
          entry.rawBody = sms.body
          entry.smsDate = sms.date
          entry.smsFingerprint = smsFingerprint
          entry.parseStatus = parsed.parseStatus
          entry.parsedAmount = parsed.amount
          entry.parsedCurrencyCode = parsed.currencyCode
          entry.parsedMerchant = parsed.merchant
          entry.parsedAccountSource = parsed.accountSource
          entry.referenceNumber = parsed.referenceNumber
          entry.direction = this.toDirection(parsed.type)
          entry.processingStatus = processingStatus
          entry.linkedJournalId = linkedJournalId || existing.linkedJournalId
          entry.duplicateJournalId = duplicate?.journalId
          entry.duplicateConfidence = duplicate?.score
          entry.parseConfidence = parsed.confidence
          entry.parseReason = parsed.parseReason
          entry.metadataJson = metadataJson
          entry.lastScannedAt = now
          entry.processedAt = this.isProcessedStatus(processingStatus) ? now : existing.processedAt
        })
      })
      return existing
    }

    let created!: SmsInboxRecord
    await database.write(async () => {
      created = await this.inbox.create((entry) => {
        entry.deviceSmsId = sms.id
        entry.senderAddress = sms.address
        entry.rawBody = sms.body
        entry.smsDate = sms.date
        entry.smsFingerprint = smsFingerprint
        entry.parseStatus = parsed.parseStatus
        entry.parsedAmount = parsed.amount
        entry.parsedCurrencyCode = parsed.currencyCode
        entry.parsedMerchant = parsed.merchant
        entry.parsedAccountSource = parsed.accountSource
        entry.referenceNumber = parsed.referenceNumber
        entry.direction = this.toDirection(parsed.type)
        entry.processingStatus = processingStatus
        entry.linkedJournalId = linkedJournalId
        entry.duplicateJournalId = duplicate?.journalId
        entry.duplicateConfidence = duplicate?.score
        entry.parseConfidence = parsed.confidence
        entry.parseReason = parsed.parseReason
        entry.metadataJson = metadataJson
        entry.firstSeenAt = now
        entry.lastScannedAt = now
        entry.processedAt = this.isProcessedStatus(processingStatus) ? now : undefined
      })
    })

    return created
  }

  private async findDuplicateCandidatesForParsed(parsed: ParsedTransaction): Promise<DuplicateMatch> {
    const exact = await journalRepository.findJournalByOriginalSmsId(parsed.id)
    if (exact) {
      return { journalId: exact.id, score: 1, reasons: ['Exact SMS already linked to journal'] }
    }

    if (!parsed.amount) return null

    const nearby = await journalRepository.findNearbyJournals({
      centerDate: parsed.date,
      windowMs: this.DAY_WINDOW_MS,
      amount: parsed.amount,
      limit: 8,
    })

    if (nearby.length === 0) return null

    const accountLookup = new Map<string, string>()
    let best: DuplicateMatch = null

    for (const journal of nearby) {
      const reasons: string[] = []
      let score = 0

      score += 0.45
      reasons.push('Same amount')

      const timeDistance = Math.abs(journal.journalDate - parsed.date)
      const timeScore = Math.max(0, 0.2 - (timeDistance / this.DAY_WINDOW_MS) * 0.2)
      score += timeScore
      if (timeScore > 0.1) {
        reasons.push('Close in time')
      }

      const description = (journal.description || '').toLowerCase()
      if (parsed.merchant && description.includes(parsed.merchant.toLowerCase())) {
        score += 0.2
        reasons.push('Merchant matches description')
      }
      if (parsed.referenceNumber && description.includes(parsed.referenceNumber.toLowerCase())) {
        score += 0.1
        reasons.push('Reference matches description')
      }

      if (parsed.accountSource) {
        const transactions = await database.collections.get<any>('transactions')
          .query(Q.where('journal_id', journal.id), Q.where('deleted_at', Q.eq(null)))
          .fetch()
        const accountIds = Array.from(new Set(transactions.map((item: any) => item.accountId)))
        const accounts = await accountRepository.findAllByIds(accountIds)
        for (const account of accounts) {
          accountLookup.set(account.id, `${account.name} ${account.description || ''}`.toLowerCase())
        }
        const normalizedSource = parsed.accountSource.toLowerCase().replace(/[^a-z0-9]/g, '')
        const sourceMatched = accounts.some((account) =>
          accountLookup.get(account.id)?.replace(/[^a-z0-9]/g, '').includes(normalizedSource)
        )
        if (sourceMatched) {
          score += 0.05
          reasons.push('Account source hint matches account')
        }
      }

      if (!best || score > best.score) {
        best = { journalId: journal.id, score, reasons }
      }
    }

    return best && best.score >= 0.45 ? best : null
  }

  private classifyDirection(text: string): 'debit' | 'credit' | 'unknown' {
    const isDebit = ['debited', 'spent', 'paid', 'purchase', 'withdrawn', 'txn'].some((keyword) => text.includes(keyword))
    const isCredit = ['credited', 'received', 'deposited', 'refund', 'reversed'].some((keyword) => text.includes(keyword))

    if (isDebit && !isCredit) return 'debit'
    if (isCredit && !isDebit) return 'credit'
    if (isDebit) return 'debit'
    return 'unknown'
  }

  private extractCurrencyAndAmount(body: string): { amount: number; currencyCode: string | null } | null {
    const patterns: Array<{ regex: RegExp; currencyGroup?: number; amountGroup: number }> = [
      { regex: /(?:amt|amount|txn(?: of)?|debited(?: by)?|credited(?: with)?|spent|paid|received|deposited)[^\dA-Z₹$€£¥]*((?:INR|USD|EUR|GBP|AED|SAR|CAD|AUD|SGD|JPY|CHF|HKD|CNY|₹|Rs\.?|INR\.?|US\$|A\$|C\$|\$|€|£|¥)?)\s*([\d,.]+(?:\.\d+)?)/i, currencyGroup: 1, amountGroup: 2 },
      { regex: /((?:INR|USD|EUR|GBP|AED|SAR|CAD|AUD|SGD|JPY|CHF|HKD|CNY|₹|Rs\.?|INR\.?|US\$|A\$|C\$|\$|€|£|¥))\s*([\d,.]+(?:\.\d+)?)/i, currencyGroup: 1, amountGroup: 2 },
      { regex: /([\d,.]+(?:\.\d+)?)\s*((?:INR|USD|EUR|GBP|AED|SAR|CAD|AUD|SGD|JPY|CHF|HKD|CNY))/i, currencyGroup: 2, amountGroup: 1 },
    ]

    for (const pattern of patterns) {
      const match = body.match(pattern.regex)
      if (!match) continue
      const amount = this.normalizeAmount(match[pattern.amountGroup])
      if (!amount || amount <= 0) continue
      const currencyCode = this.normalizeCurrencyCode(pattern.currencyGroup ? match[pattern.currencyGroup] : undefined)
      return { amount, currencyCode }
    }

    return null
  }

  private extractMerchant(body: string, direction: 'debit' | 'credit' | 'unknown'): string | undefined {
    const patterns = direction === 'credit'
      ? [/(?:from|by)\s+([a-zA-Z0-9.\s@&-]+?)(?:\s+(?:on|ref|utr|txn|bal)|[,.]|$)/i]
      : [/(?:to|at|vpa|info[:]?)\s+([a-zA-Z0-9.\s@&-]+?)(?:\s+(?:on|ref|utr|by|bal)|[,.]|$)/i]

    for (const regex of patterns) {
      const match = body.match(regex)
      const value = match?.[1]?.trim()
      if (value && value.length > 1) {
        return value.replace(/\s+/g, ' ')
      }
    }

    return undefined
  }

  private extractAccountSource(body: string): string | undefined {
    const sourceRegex = /(?:a\/c|acct|acc|card)\s*[:\-]?\s*[*xX.-]*(\d{3,6})|by\s+(UPI)|([xX*.]{2,}[\s\-]?\d{3,6})/i
    const match = body.match(sourceRegex)
    if (!match) return undefined
    if (match[1]) {
      const prefixMatch = body.match(/card/i)
      return `${prefixMatch ? 'Card' : 'A/c'} ${match[1]}`
    }
    if (match[2]) return 'UPI'
    if (match[3]) return `A/c ${match[3].replace(/[^0-9]/g, '')}`
    return undefined
  }

  private extractReferenceNumber(body: string): string | undefined {
    const match = body.match(/(?:utr|ref(?:\s*no)?|txn\s*id|transaction\s*id|rrn|cheque(?:\s*no)?)\s*[:\-]?\s*([a-zA-Z0-9]{6,30})/i)
    return match?.[1]
  }

  private normalizeAmount(raw: string): number | null {
    const normalized = raw.replace(/,/g, '')
    const amount = parseFloat(normalized)
    return Number.isFinite(amount) ? amount : null
  }

  private normalizeCurrencyCode(raw?: string): string | null {
    if (!raw) return null
    const normalized = raw.trim().toUpperCase()
    const symbolMap: Record<string, string> = {
      '₹': 'INR',
      'RS': 'INR',
      'RS.': 'INR',
      '$': 'USD',
      'US$': 'USD',
      'A$': 'AUD',
      'C$': 'CAD',
      '€': 'EUR',
      '£': 'GBP',
      '¥': 'JPY',
    }

    return symbolMap[normalized] || normalized.replace(/\./g, '')
  }

  private toDirection(type: 'debit' | 'credit' | 'unknown'): SmsDirection {
    if (type === 'debit') return SmsDirection.DEBIT
    if (type === 'credit') return SmsDirection.CREDIT
    return SmsDirection.UNKNOWN
  }

  private resolveProcessingStatus(params: {
    parsed: ParsedTransaction
    processedIds: Set<string>
    exactJournalId?: string
    duplicate: DuplicateMatch
    existingStatus?: SmsProcessingStatus
  }): SmsProcessingStatus {
    const { parsed, processedIds, exactJournalId, duplicate, existingStatus } = params

    if (exactJournalId) return SmsProcessingStatus.IMPORTED
    if (parsed.parseStatus === SmsParseStatus.PARSE_FAILED) return SmsProcessingStatus.PARSE_FAILED
    if (existingStatus === SmsProcessingStatus.AUTO_POSTED || existingStatus === SmsProcessingStatus.IMPORTED) {
      return existingStatus
    }
    if (duplicate) return SmsProcessingStatus.DUPLICATE_FLAGGED
    if (processedIds.has(parsed.id)) return SmsProcessingStatus.DISMISSED
    return SmsProcessingStatus.PENDING
  }

  private getProcessingStatusesForFilter(filter?: SmsInboxFilterOptions['status']): SmsProcessingStatus[] {
    switch (filter) {
      case 'pending':
        return [SmsProcessingStatus.PENDING]
      case 'processed':
        return [SmsProcessingStatus.IMPORTED, SmsProcessingStatus.AUTO_POSTED, SmsProcessingStatus.DISMISSED]
      case 'auto_posted':
        return [SmsProcessingStatus.AUTO_POSTED]
      case 'duplicates':
        return [SmsProcessingStatus.DUPLICATE_FLAGGED]
      case 'failed':
        return [SmsProcessingStatus.PARSE_FAILED]
      default:
        return []
    }
  }

  private isProcessedStatus(status: SmsProcessingStatus): boolean {
    return [SmsProcessingStatus.IMPORTED, SmsProcessingStatus.AUTO_POSTED, SmsProcessingStatus.DISMISSED].includes(status)
  }

  private buildRegex(pattern?: string): RegExp | null {
    if (!pattern?.trim()) return null
    try {
      return new RegExp(pattern, 'i')
    } catch {
      return null
    }
  }

  private matchesPreviewRule(record: SmsInboxRecord, input: SmsRulePreviewInput): boolean {
    if (input.mode === 'builder') {
      const conditions = (input.conditions || []).filter((condition) => this.isMeaningfulCondition(condition))
      if (conditions.length === 0) return false
      return this.matchesStructuredConditions(record, conditions)
    }

    const senderRegex = this.buildRegex(input.senderMatch)
    const bodyRegex = input.bodyMatch ? this.buildRegex(input.bodyMatch) : null
    const senderOk = senderRegex?.test(record.senderAddress.substring(0, AppConfig.input.sms.maxSenderMatchLength))
    const bodyOk = bodyRegex ? bodyRegex.test(record.rawBody.substring(0, AppConfig.input.sms.maxBodyMatchLength)) : true
    return !!senderOk && bodyOk
  }

  private getRulePriority(rule: SmsAutoPostRule): number {
    return typeof rule.priority === 'number' ? rule.priority : 100
  }

  private getRuleDefinition(rule: SmsAutoPostRule): ResolvedSmsRule {
    let conditions: SmsRuleCondition[] = []
    let actions: SmsRuleActions = {
      disposition: 'auto_post',
      sourceAccountId: rule.sourceAccountId || undefined,
      categoryAccountId: rule.categoryAccountId || undefined,
    }
    let mode: SmsRuleMode = 'regex'

    if (rule.conditionsJson) {
      try {
        const parsed = JSON.parse(rule.conditionsJson)
        if (Array.isArray(parsed)) {
          conditions = parsed.filter((condition) => this.isMeaningfulCondition(condition))
          if (conditions.length > 0) {
            mode = 'builder'
          }
        }
      } catch {
        conditions = []
      }
    }

    if (rule.actionsJson) {
      try {
        const parsed = JSON.parse(rule.actionsJson)
        if (parsed && typeof parsed === 'object') {
          actions = {
            disposition: parsed.disposition === 'ignore' || parsed.disposition === 'review' ? parsed.disposition : 'auto_post',
            sourceAccountId: parsed.sourceAccountId || actions.sourceAccountId,
            categoryAccountId: parsed.categoryAccountId || actions.categoryAccountId,
          }
        }
      } catch {
        // keep fallback actions
      }
    }

    return {
      mode,
      senderMatch: rule.senderMatch || undefined,
      bodyMatch: rule.bodyMatch || undefined,
      conditions,
      actions,
      priority: this.getRulePriority(rule),
    }
  }

  private matchesResolvedRule(record: SmsInboxRecord, definition: ResolvedSmsRule): boolean {
    if (definition.mode === 'builder' && definition.conditions.length > 0) {
      return this.matchesStructuredConditions(record, definition.conditions)
    }

    const senderRegex = this.buildRegex(definition.senderMatch)
    const bodyRegex = definition.bodyMatch ? this.buildRegex(definition.bodyMatch) : null
    const senderOk = senderRegex?.test(record.senderAddress.substring(0, AppConfig.input.sms.maxSenderMatchLength))
    const bodyOk = bodyRegex ? bodyRegex.test(record.rawBody.substring(0, AppConfig.input.sms.maxBodyMatchLength)) : true
    return !!senderOk && bodyOk
  }

  private matchesStructuredConditions(record: SmsInboxRecord, conditions: SmsRuleCondition[]): boolean {
    return conditions.every((condition) => this.matchesCondition(record, condition))
  }

  private matchesCondition(record: SmsInboxRecord, condition: SmsRuleCondition): boolean {
    const normalizedValue = condition.value?.trim()

    switch (condition.field) {
      case 'sender':
        return this.matchesStringCondition(record.senderAddress, condition.operator as SmsRuleStringOperator, normalizedValue)
      case 'body':
        return this.matchesStringCondition(record.rawBody, condition.operator as SmsRuleStringOperator, normalizedValue)
      case 'merchant':
        return this.matchesStringCondition(record.parsedMerchant, condition.operator as SmsRuleStringOperator, normalizedValue)
      case 'account_source':
        return this.matchesStringCondition(record.parsedAccountSource, condition.operator as SmsRuleStringOperator, normalizedValue)
      case 'direction':
        return this.matchesStringCondition(record.direction, 'is', normalizedValue)
      case 'currency':
        return this.matchesStringCondition(record.parsedCurrencyCode, 'is', normalizedValue)
      case 'amount':
        return this.matchesAmountCondition(record.parsedAmount, condition)
      default:
        return false
    }
  }

  private matchesStringCondition(
    source: string | undefined,
    operator: SmsRuleStringOperator,
    value?: string
  ): boolean {
    if (!source || !value) return false
    const left = source.toLowerCase()
    const right = value.toLowerCase()
    return operator === 'is' ? left === right : left.includes(right)
  }

  private matchesAmountCondition(amount: number | undefined, condition: SmsRuleCondition): boolean {
    if (typeof amount !== 'number') return false
    const operator = condition.operator as SmsRuleAmountOperator
    const minValue = typeof condition.minValue === 'number' ? condition.minValue : undefined
    const maxValue = typeof condition.maxValue === 'number' ? condition.maxValue : undefined
    const exactValue = typeof condition.minValue === 'number' ? condition.minValue : undefined

    switch (operator) {
      case 'eq':
        return exactValue !== undefined ? Math.abs(amount - exactValue) < 0.0001 : false
      case 'gt':
        return minValue !== undefined ? amount > minValue : false
      case 'lt':
        return minValue !== undefined ? amount < minValue : false
      case 'between':
        return minValue !== undefined && maxValue !== undefined
          ? amount >= Math.min(minValue, maxValue) && amount <= Math.max(minValue, maxValue)
          : false
      default:
        return false
    }
  }

  private isMeaningfulCondition(condition: Partial<SmsRuleCondition> | null | undefined): condition is SmsRuleCondition {
    if (!condition?.field || !condition.operator) return false
    if (condition.field === 'amount') {
      if (condition.operator === 'between') {
        return typeof condition.minValue === 'number' && typeof condition.maxValue === 'number'
      }
      return typeof condition.minValue === 'number'
    }
    return !!condition.value?.trim()
  }

  private async getProcessedSmsIds(): Promise<string[]> {
    try {
      const data = await AsyncStorage.getItem(this.PROCESSED_SMS_KEY)
      return data ? JSON.parse(data) : []
    } catch (error) {
      logger.error('Failed to get processed SMS IDs', error)
      return []
    }
  }

  async markSmsAsProcessed(smsId: string): Promise<void> {
    try {
      const processedIds = await this.getProcessedSmsIds()
      if (!processedIds.includes(smsId)) {
        processedIds.push(smsId)
        const maxStored = AppConfig.input.sms.maxStoredProcessedIds
        if (processedIds.length > maxStored) {
          processedIds.splice(0, processedIds.length - maxStored)
        }
        await AsyncStorage.setItem(this.PROCESSED_SMS_KEY, JSON.stringify(processedIds))
      }
    } catch (error) {
      logger.error('Failed to mark SMS as processed', error)
    }
  }

  private computeSmsFingerprint(sender: string, body: string, date: number): string {
    const normalizedSender = sender.toLowerCase().replace(/[^a-z0-9]/g, '')
    const normalizedBody = body.toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z0-9 ]/g, '').trim()
    const dateBucket = Math.floor(date / this.DAY_WINDOW_MS)
    return `${normalizedSender}::${normalizedBody.slice(0, 160)}::${dateBucket}`
  }

  private async buildSuggestionFromHistory(group: {
    senderAddress: string
    merchant?: string
    accountSource?: string
    journalIds: string[]
    count: number
  }): Promise<SmsRuleSuggestion | null> {
    const journals = await journalRepository.findByIds(group.journalIds.slice(0, 10))
    const accountIds = new Set<string>()
    const journalTransactions = new Map<string, any[]>()

    for (const journal of journals) {
      const transactions = await database.collections.get<any>('transactions')
        .query(Q.where('journal_id', journal.id), Q.where('deleted_at', Q.eq(null)))
        .fetch()
      journalTransactions.set(journal.id, transactions)
      transactions.forEach((tx: any) => accountIds.add(tx.accountId))
    }

    const accounts = await accountRepository.findAllByIds(Array.from(accountIds))
    const accountMap = new Map(accounts.map((account) => [account.id, account]))
    const sourceCounts = new Map<string, number>()
    const categoryCounts = new Map<string, number>()

    for (const journal of journals) {
      const transactions = journalTransactions.get(journal.id) || []
      for (const tx of transactions) {
        const account = accountMap.get(tx.accountId)
        if (!account) continue
        if ([AccountType.ASSET, AccountType.LIABILITY].includes(account.accountType as AccountType)) {
          sourceCounts.set(account.id, (sourceCounts.get(account.id) || 0) + 1)
        } else if ([AccountType.EXPENSE, AccountType.INCOME].includes(account.accountType as AccountType)) {
          categoryCounts.set(account.id, (categoryCounts.get(account.id) || 0) + 1)
        }
      }
    }

    const sourceAccountId = Array.from(sourceCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0]
    const categoryAccountId = Array.from(categoryCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0]
    if (!sourceAccountId || !categoryAccountId) return null

    const sourceAccount = accountMap.get(sourceAccountId)
    const categoryAccount = accountMap.get(categoryAccountId)
    if (!sourceAccount || !categoryAccount) return null

    return {
      senderMatch: group.senderAddress.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      bodyMatch: group.merchant ? group.merchant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : group.accountSource,
      sourceAccountId,
      categoryAccountId,
      sourceAccountName: sourceAccount.name,
      categoryAccountName: categoryAccount.name,
      sampleCount: group.count,
      sampleMerchants: group.merchant ? [group.merchant] : [],
    }
  }
}

export const smsService = new SmsService()
