import {
  AppButton,
  AppCard,
  AppText,
  EmptyStateView,
  ErrorStateView,
  FilterChipButton,
  Icon,
  LoadingView,
} from '@/src/components/core';
import { AppConfig, Size, Spacing } from '@/src/constants';
import { Stack } from '@/src/design-system';
import { DuplicateConflictResolutionModal } from '@/src/features/settings/components/DuplicateConflictResolutionModal';
import { EditReparseSmsModal } from '@/src/features/settings/components/EditReparseSmsModal';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import { TransactionInboxItemCardView } from '@/src/features/settings/components/TransactionInboxItemCardView';
import { TransactionInboxViewModel } from '@/src/features/settings/hooks/useTransactionInboxViewModel';
import { transactionCaptureStrings as strings } from '@/src/constants/copy/domains/transactionCaptureStrings';
import { shortcutSmsIntakeService } from '@/src/services/sms/ShortcutSmsIntakeService';
import type { ReactNode } from 'react';
import { FlatList, Platform, ScrollView, StyleSheet, View } from 'react-native';

interface TransactionInboxViewProps {
  vm: TransactionInboxViewModel;
  headerActions?: ReactNode;
}

export function TransactionInboxView({ vm, headerActions }: TransactionInboxViewProps) {
  const {
    filter,
    setFilter,
    items,
    isLoading,
    isLoadingMore,
    error,
    retry,
    hasMore,
    hasOlderMessages,
    handleLoadMore,
    isScanningOlder,
    handleLoadOlder,
    handleDismiss,
    handleUndismiss,
    handleImport,
    handleOpenJournal,
    handleRepairOldUpiMerchants,
    isRepairingOldUpiMerchants,
    showOldUpiMerchantRepair,
    selectedDuplicateItem,
    selectedEditReparseItem,
    isDuplicateModalVisible,
    isEditReparseModalVisible,
    handleOpenDuplicateModal,
    handleCloseDuplicateModal,
    handleDismissDuplicateModal,
    handleOpenEditReparseModal,
    handleCloseEditReparseModal,
    handleDismissEditReparseModal,
    handleOpenAttachToJournal,
    handleDetachFromJournal,
    handleMergeDuplicate,
    handleSplitImport,
    handleViewJournalFromDuplicate,
    filterButtons,
    defaultCurrencyCode,
  } = vm;

  const isAndroid = Platform.OS === 'android';
  const showSmsPlatformNotice = !isAndroid && !shortcutSmsIntakeService.canSetUp;
  const loadFailure = (variant: 'screen' | 'inline' = 'screen') =>
    error ? (
      <ErrorStateView
        variant={variant}
        message={AppConfig.strings.common.listLoadError}
        retryLabel={AppConfig.strings.common.retry}
        onRetry={retry}
        style={variant === 'inline' ? styles.loadFailureInline : undefined}
      />
    ) : null;

  return (
    <View style={styles.container} testID="transaction-inbox-screen">
      <SettingsLayout
        title={strings.inboxTitle}
        headerActions={headerActions}
        scrollable={false}
        hideFooter
      >
        <View style={styles.container}>
          {showSmsPlatformNotice && filter === 'pending' ? (
            <View style={styles.platformNoticeWrap}>
              <AppCard variant="secondary" padding="md">
                <AppText variant="caption" color="secondary">
                  Note: SMS transaction scanning is only supported on Android devices. Voice input
                  drafts are fully supported.
                </AppText>
              </AppCard>
            </View>
          ) : null}

          <FlatList
            data={items}
            keyExtractor={item => item.id}
            ListHeaderComponent={
              <View style={styles.listHeader}>
                <AppText variant="caption" color="secondary" weight="medium">
                  Filter by status
                </AppText>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.filters}
                >
                  {filterButtons.map(button => (
                    <FilterChipButton
                      key={button.key}
                      label={button.label}
                      isActive={filter === button.key}
                      onPress={() => setFilter(button.key)}
                      style={styles.filterButton}
                      testID={`inbox-filter-${button.key}`}
                    />
                  ))}
                </ScrollView>
                {(filter === 'processed' || filter === 'auto_posted') &&
                showOldUpiMerchantRepair ? (
                  <Stack gap="sm" style={styles.repairSection}>
                    <AppText variant="caption" color="secondary">
                      Fixes old SMS merchant names cut at a period inside a UPI ID. Posted journal
                      entries stay unchanged.
                    </AppText>
                    <AppButton
                      variant="secondary"
                      size="sm"
                      onPress={handleRepairOldUpiMerchants}
                      loading={isRepairingOldUpiMerchants}
                    >
                      Repair old UPI merchant names
                    </AppButton>
                  </Stack>
                ) : null}
              </View>
            }
            renderItem={({ item }) => (
              <TransactionInboxItemCardView
                item={item}
                currencyCode={defaultCurrencyCode}
                handleDismiss={handleDismiss}
                handleUndismiss={handleUndismiss}
                handleImport={handleImport}
                onCompareDuplicate={handleOpenDuplicateModal}
                onAttachToJournal={handleOpenAttachToJournal}
                onDetachFromJournal={handleDetachFromJournal}
                onOpenJournal={handleOpenJournal}
                onSplitImport={handleSplitImport}
                onEditReparse={handleOpenEditReparseModal}
                testID={`inbox-item-${item.deviceSourceId}`}
              />
            )}
            contentContainerStyle={styles.content}
            ListEmptyComponent={
              error ? (
                loadFailure()
              ) : isLoading ? (
                <LoadingView
                  loading
                  variant="inline"
                  text={isAndroid ? 'Scanning SMS and pending inputs…' : 'Loading pending items…'}
                  style={styles.center}
                />
              ) : (
                <EmptyStateView
                  title={filter === 'pending' ? 'Inbox is clear' : 'No matching inbox items'}
                  icon={Icon.Check}
                  subtitle={
                    filter === 'pending'
                      ? isAndroid
                        ? 'Try refreshing or loading older messages.'
                        : 'No pending drafts to review.'
                      : 'No inbox items match the selected filter.'
                  }
                />
              )
            }
            ListFooterComponent={
              error ? (
                items.length > 0 ? (
                  loadFailure('inline')
                ) : null
              ) : hasMore || (isAndroid && hasOlderMessages) || isLoadingMore || isScanningOlder ? (
                <Stack gap="lg" style={styles.footer}>
                  {(isLoadingMore || isScanningOlder) && (
                    <LoadingView
                      loading
                      variant="inline"
                      text={isScanningOlder ? strings.inboxScanningOlder : strings.inboxLoadingMore}
                    />
                  )}
                  {hasMore && (
                    <AppButton
                      variant="secondary"
                      size="sm"
                      onPress={handleLoadMore}
                      loading={isLoadingMore}
                    >
                      Load more
                    </AppButton>
                  )}
                  {isAndroid && hasOlderMessages && (
                    <AppButton
                      variant="secondary"
                      size="sm"
                      onPress={handleLoadOlder}
                      loading={isScanningOlder}
                    >
                      Scan older SMS
                    </AppButton>
                  )}
                </Stack>
              ) : null
            }
          />
        </View>
      </SettingsLayout>

      <DuplicateConflictResolutionModal
        visible={isDuplicateModalVisible}
        item={selectedDuplicateItem}
        defaultCurrencyCode={defaultCurrencyCode}
        onClose={handleCloseDuplicateModal}
        onDismiss={handleDismissDuplicateModal}
        onMarkDuplicateAndDismiss={handleDismiss}
        onMerge={handleMergeDuplicate}
        onPostAnyway={handleImport}
        onViewJournal={handleViewJournalFromDuplicate}
      />

      <EditReparseSmsModal
        visible={isEditReparseModalVisible}
        item={selectedEditReparseItem}
        defaultCurrencyCode={defaultCurrencyCode}
        onClose={handleCloseEditReparseModal}
        onDismiss={handleDismissEditReparseModal}
        onImportParsed={handleImport}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  listHeader: {
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  repairSection: {
    marginTop: Spacing.xs,
  },
  platformNoticeWrap: {
    marginBottom: Spacing.sm,
  },
  filters: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingRight: Spacing.md,
  },
  filterButton: {
    minHeight: Size.touchTargetLg,
  },
  center: {
    paddingVertical: Spacing.xl,
    justifyContent: 'center',
  },
  footer: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  loadFailureInline: {
    padding: Spacing.lg,
  },
});
