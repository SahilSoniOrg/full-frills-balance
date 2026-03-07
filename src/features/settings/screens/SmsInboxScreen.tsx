import { AppButton, AppCard, AppText, Badge, EmptyStateView } from '@/src/components/core'
import { Screen } from '@/src/components/layout'
import { AppConfig } from '@/src/constants/app-config'
import { Opacity, Spacing, withOpacity } from '@/src/constants'
import { useAccounts } from '@/src/features/accounts'
import { usePaginatedObservable } from '@/src/hooks/usePaginatedObservable'
import SmsInboxRecord, { SmsProcessingStatus } from '@/src/data/models/SmsInboxRecord'
import { journalRepository } from '@/src/data/repositories/JournalRepository'
import { useTheme } from '@/src/hooks/use-theme'
import { smsService } from '@/src/services/sms-service'
import { SmsDuplicateCandidate, SmsInboxItem } from '@/src/types/domain'
import { alert, showErrorAlert, toast } from '@/src/utils/alerts'
import { CurrencyFormatter } from '@/src/utils/currencyFormatter'
import { AppNavigation } from '@/src/utils/navigation'
import dayjs from 'dayjs'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native'

type InboxFilter = 'pending' | 'processed' | 'auto_posted' | 'duplicates' | 'failed'

const PAGE_SIZE = 25

function normalizeForMatch(value?: string) {
  return (value || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

export default function SmsInboxScreen() {
  const { theme } = useTheme()
  const { accounts } = useAccounts()
  const [filter, setFilter] = useState<InboxFilter>('pending')
  const [scanCursor, setScanCursor] = useState(PAGE_SIZE)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isScanningOlder, setIsScanningOlder] = useState(false)

  const observe = useCallback((limit: number) => smsService.observeInbox(limit, { status: filter }), [filter])

  const enrich = useCallback(async (records: SmsInboxRecord[]) => {
    const linkedIds = Array.from(new Set(records.map((record) => record.linkedJournalId).filter(Boolean) as string[]))
    const duplicateIds = Array.from(new Set(records.map((record) => record.duplicateJournalId).filter(Boolean) as string[]))
    const journals = await journalRepository.findByIds(Array.from(new Set([...linkedIds, ...duplicateIds])))
    const journalMap = new Map(journals.map((journal) => [journal.id, journal]))

    return records.map((record): SmsInboxItem => {
      const metadata = record.metadataJson ? JSON.parse(record.metadataJson) : {}
      const duplicateCandidate: SmsDuplicateCandidate | undefined = record.duplicateJournalId
        ? {
          journalId: record.duplicateJournalId,
          journalDate: journalMap.get(record.duplicateJournalId)?.journalDate || record.smsDate,
          description: journalMap.get(record.duplicateJournalId)?.description,
          score: record.duplicateConfidence || 0,
          reasons: Array.isArray(metadata.duplicateReasons) ? metadata.duplicateReasons : [],
        }
        : undefined

      return {
        id: record.id,
        deviceSmsId: record.deviceSmsId,
        senderAddress: record.senderAddress,
        rawBody: record.rawBody,
        smsDate: record.smsDate,
        parseStatus: record.parseStatus,
        processingStatus: record.processingStatus,
        parsedAmount: record.parsedAmount,
        parsedCurrencyCode: record.parsedCurrencyCode,
        parsedMerchant: record.parsedMerchant,
        parsedAccountSource: record.parsedAccountSource,
        referenceNumber: record.referenceNumber,
        direction: record.direction,
        parseConfidence: record.parseConfidence,
        parseReason: record.parseReason,
        linkedJournal: record.linkedJournalId
          ? {
            journalId: record.linkedJournalId,
            description: journalMap.get(record.linkedJournalId)?.description,
            journalDate: journalMap.get(record.linkedJournalId)?.journalDate || record.smsDate,
            status: journalMap.get(record.linkedJournalId)?.status || 'POSTED',
          }
          : undefined,
        duplicateCandidate,
      }
    })
  }, [])

  const { items, isLoading, isLoadingMore, hasMore, loadMore } = usePaginatedObservable<SmsInboxRecord, SmsInboxItem>({
    pageSize: PAGE_SIZE,
    observe,
    enrich,
  })

  useEffect(() => {
    let isMounted = true
    const prime = async () => {
      try {
        const result = await smsService.scanRecentSmsPage(PAGE_SIZE * 2)
        if (isMounted) {
          setScanCursor(result.cursor)
        }
      } catch (error) {
        showErrorAlert(error, 'SMS Inbox', true)
      }
    }
    prime()
    return () => {
      isMounted = false
    }
  }, [])

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    try {
      const result = await smsService.refreshLatestSms(PAGE_SIZE * 2)
      setScanCursor(result.cursor)
      toast.success('SMS inbox refreshed')
    } catch (error) {
      showErrorAlert(error, 'SMS Inbox', true)
    } finally {
      setIsRefreshing(false)
    }
  }, [])

  const handleLoadOlder = useCallback(async () => {
    if (isScanningOlder) return
    setIsScanningOlder(true)
    try {
      const result = await smsService.scanOlderSmsPage(scanCursor, PAGE_SIZE)
      setScanCursor(result.cursor)
      loadMore()
    } catch (error) {
      showErrorAlert(error, 'SMS Inbox', true)
    } finally {
      setIsScanningOlder(false)
    }
  }, [isScanningOlder, loadMore, scanCursor])

  const handleDismiss = useCallback(async (item: SmsInboxItem) => {
    await smsService.markInboxRecordStatus(item.id, SmsProcessingStatus.DISMISSED)
    await smsService.markSmsAsProcessed(item.deviceSmsId)
  }, [])

  const handleUndismiss = useCallback(async (item: SmsInboxItem) => {
    await smsService.markInboxRecordStatus(item.id, item.duplicateCandidate ? SmsProcessingStatus.DUPLICATE_FLAGGED : SmsProcessingStatus.PENDING)
  }, [])

  const handleImport = useCallback((item: SmsInboxItem) => {
    let matchedBankAccountId: string | undefined
    let matchedCounterpartyId: string | undefined

    if (item.parsedAccountSource) {
      const normalizedSource = normalizeForMatch(item.parsedAccountSource)
      const sourceDigits = item.parsedAccountSource.match(/(\d{3,6})/)?.[1]
      const bestAccount = accounts.find((account) => {
        const name = normalizeForMatch(account.name)
        const description = normalizeForMatch(account.description)
        if (sourceDigits && ((account.name || '').includes(sourceDigits) || (account.description || '').includes(sourceDigits))) {
          return true
        }
        return name.includes(normalizedSource) || description.includes(normalizedSource)
      })
      matchedBankAccountId = bestAccount?.id
    }

    if (item.parsedMerchant) {
      const normalizedMerchant = normalizeForMatch(item.parsedMerchant)
      const bestAccount = accounts.find((account) => {
        const name = normalizeForMatch(account.name)
        return name.includes(normalizedMerchant) || normalizedMerchant.includes(name)
      })
      if (bestAccount && bestAccount.id !== matchedBankAccountId) {
        matchedCounterpartyId = bestAccount.id
      }
    }

    let type: 'expense' | 'income' | 'transfer' = item.direction === 'credit' ? 'income' : 'expense'
    if (matchedBankAccountId && matchedCounterpartyId) {
      type = 'transfer'
    }

    const params: Record<string, string> = {
      type,
      amount: String(item.parsedAmount || ''),
      notes: `Imported from: ${item.parsedMerchant || item.senderAddress}${item.referenceNumber ? `\nRef: ${item.referenceNumber}` : ''}\n\n${item.rawBody.substring(0, AppConfig.input.sms.previewBodyChars)}...`,
    }

    if (item.direction === 'debit') {
      if (matchedBankAccountId) params.sourceAccountId = matchedBankAccountId
      if (matchedCounterpartyId) params.destinationAccountId = matchedCounterpartyId
    } else {
      if (matchedCounterpartyId) params.sourceAccountId = matchedCounterpartyId
      if (matchedBankAccountId) params.destinationAccountId = matchedBankAccountId
    }

    AppNavigation.toJournalEntry({
      smsId: item.deviceSmsId,
      smsRecordId: item.id,
      smsSender: item.senderAddress,
      rawSmsBody: item.rawBody,
      initialDate: new Date(item.smsDate).toISOString(),
      params,
    })
  }, [accounts])

  const filterButtons = useMemo(() => ([
    { key: 'pending' as InboxFilter, label: 'Pending' },
    { key: 'processed' as InboxFilter, label: 'Processed' },
    { key: 'auto_posted' as InboxFilter, label: 'Auto-Posted' },
    { key: 'duplicates' as InboxFilter, label: 'Duplicates' },
    { key: 'failed' as InboxFilter, label: 'Failed' },
  ]), [])

  return (
    <Screen
      title="SMS Inbox"
      showBack
      scrollable={false}
      headerActions={(
        <View style={styles.headerActions}>
          <AppButton variant="ghost" size="sm" onPress={AppNavigation.toSmsRules}>Rules</AppButton>
          <AppButton variant="ghost" size="sm" loading={isRefreshing} onPress={handleRefresh}>Refresh</AppButton>
        </View>
      )}
    >
      <View style={styles.container}>
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={(
            <View style={styles.filters}>
              {filterButtons.map((button) => (
                <AppButton
                  key={button.key}
                  size="sm"
                  variant={filter === button.key ? 'primary' : 'secondary'}
                  onPress={() => setFilter(button.key)}
                  style={styles.filterButton}
                >
                  {button.label}
                </AppButton>
              ))}
            </View>
          )}
          renderItem={({ item }) => (
            <AppCard style={styles.card}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <AppText variant="subheading">{item.parsedMerchant || item.senderAddress}</AppText>
                  <AppText variant="caption" color="secondary">
                    {dayjs(item.smsDate).format('MMM D, YYYY h:mm A')}
                  </AppText>
                </View>
                <View style={styles.amountColumn}>
                  <AppText
                    variant="subheading"
                    style={{ color: item.direction === 'credit' ? theme.success : theme.text }}
                  >
                    {item.parsedAmount != null
                      ? `${item.direction === 'credit' ? '+' : '-'} ${CurrencyFormatter.format(item.parsedAmount, item.parsedCurrencyCode || undefined)}`
                      : 'No amount'}
                  </AppText>
                  {item.parsedCurrencyCode && (
                    <AppText variant="caption" color="secondary">{item.parsedCurrencyCode}</AppText>
                  )}
                </View>
              </View>

              <View style={styles.badges}>
                <Badge size="sm" backgroundColor={withOpacity(theme.primary, Opacity.soft)} textColor={theme.primary}>
                  {item.processingStatus.replace(/_/g, ' ')}
                </Badge>
                {item.duplicateCandidate && (
                  <Badge size="sm" backgroundColor={withOpacity(theme.warning, Opacity.soft)} textColor={theme.warning}>
                    likely duplicate
                  </Badge>
                )}
                {item.linkedJournal && (
                  <Badge size="sm" backgroundColor={withOpacity(theme.success, Opacity.soft)} textColor={theme.success}>
                    linked journal
                  </Badge>
                )}
              </View>

              <AppText variant="body" color="secondary" style={styles.bodyPreview}>
                {item.rawBody}
              </AppText>

              {item.parseReason && (
                <AppText variant="caption" color="secondary">
                  {item.parseReason}
                </AppText>
              )}

              {item.duplicateCandidate && (
                <AppButton
                  variant="ghost"
                  size="sm"
                  style={styles.inlineButton}
                  onPress={() => AppNavigation.toTransactionDetails(item.duplicateCandidate!.journalId)}
                >
                  Compare duplicate
                </AppButton>
              )}

              <View style={styles.actions}>
                {item.linkedJournal ? (
                  <AppButton size="sm" variant="outline" onPress={() => AppNavigation.toTransactionDetails(item.linkedJournal!.journalId)}>
                    Open Journal
                  </AppButton>
                ) : (
                  <AppButton
                    size="sm"
                    onPress={() => handleImport(item)}
                    disabled={item.processingStatus === SmsProcessingStatus.PARSE_FAILED}
                  >
                    Import / Review
                  </AppButton>
                )}

                {item.processingStatus === SmsProcessingStatus.DISMISSED ? (
                  <AppButton size="sm" variant="secondary" onPress={() => handleUndismiss(item)}>
                    Undo
                  </AppButton>
                ) : (
                  <AppButton size="sm" variant="secondary" onPress={() => handleDismiss(item)}>
                    Dismiss
                  </AppButton>
                )}

                <AppButton
                  size="sm"
                  variant="ghost"
                  onPress={() => alert.show({ title: item.senderAddress, message: item.rawBody })}
                >
                  View Raw
                </AppButton>
              </View>
            </AppCard>
          )}
          contentContainerStyle={styles.content}
          ListEmptyComponent={isLoading ? (
            <View style={styles.center}>
              <ActivityIndicator color={theme.primary} />
              <AppText variant="caption" color="secondary" style={{ marginTop: Spacing.sm }}>
                Scanning SMS inbox...
              </AppText>
            </View>
          ) : (
            <EmptyStateView title="No SMS records" subtitle="Try refreshing or loading older messages." />
          )}
          ListFooterComponent={(
            <View style={styles.footer}>
              {(isLoadingMore || isScanningOlder) && <ActivityIndicator color={theme.primary} />}
              {(hasMore || items.length > 0) && (
                <AppButton variant="secondary" size="sm" onPress={handleLoadOlder} loading={isScanningOlder}>
                  Load Older Messages
                </AppButton>
              )}
            </View>
          )}
        />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.md,
    gap: Spacing.md,
  },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  filterButton: {
    marginRight: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  card: {
    marginBottom: Spacing.md,
  },
  cardTop: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  amountColumn: {
    alignItems: 'flex-end',
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  bodyPreview: {
    marginBottom: Spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  inlineButton: {
    alignSelf: 'flex-start',
    marginBottom: Spacing.sm,
  },
  center: {
    paddingVertical: Spacing.xl,
    alignItems: 'center',
  },
  footer: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.sm,
  },
})
