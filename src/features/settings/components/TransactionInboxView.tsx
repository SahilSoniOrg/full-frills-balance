import {
  AppButton,
  AppCard,
  AppText,
  EmptyStateView,
  FilterChipButton,
  Icon,
} from '@/src/components/core';
import { AppConfig, Size, Spacing } from '@/src/constants';
import { Stack } from '@/src/design-system';
import { DuplicateConflictResolutionModal } from '@/src/features/settings/components/DuplicateConflictResolutionModal';
import { EditReparseSmsModal } from '@/src/features/settings/components/EditReparseSmsModal';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import { TransactionInboxItemCardView } from '@/src/features/settings/components/TransactionInboxItemCardView';
import { TransactionInboxViewModel } from '@/src/features/settings/hooks/useTransactionInboxViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import type { ReactNode } from 'react';
import { ActivityIndicator, FlatList, Platform, ScrollView, StyleSheet, View } from 'react-native';

interface TransactionInboxViewProps {
  vm: TransactionInboxViewModel;
  headerActions?: ReactNode;
}

export function TransactionInboxView({ vm, headerActions }: TransactionInboxViewProps) {
  const { theme } = useTheme();
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
    selectedDuplicateItem,
    selectedEditReparseItem,
    handleOpenDuplicateModal,
    handleCloseDuplicateModal,
    handleOpenEditReparseModal,
    handleCloseEditReparseModal,
    handleMergeDuplicate,
    handleSplitImport,
    handleViewJournalFromDuplicate,
    filterButtons,
    defaultCurrencyCode,
  } = vm;

  const isAndroid = Platform.OS === 'android';
  const loadFailure = error ? (
    <EmptyStateView
      title={AppConfig.strings.common.listLoadError}
      subtitle={AppConfig.strings.common.listLoadErrorSubtitle}
      primaryActionLabel={AppConfig.strings.common.retry}
      onPrimaryAction={retry}
    />
  ) : null;

  return (
    <View style={styles.container} testID="transaction-inbox-screen">
      <SettingsLayout title="Inbox" headerActions={headerActions} scrollable={false} hideFooter>
        <View style={styles.container}>
          {!isAndroid && filter === 'pending' ? (
            <View style={styles.platformNoticeWrap}>
              <AppCard variant="secondary" paddingSize="sm">
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
                onOpenJournal={handleOpenJournal}
                onSplitImport={handleSplitImport}
                onEditReparse={handleOpenEditReparseModal}
                testID={`inbox-item-${item.deviceSourceId}`}
              />
            )}
            contentContainerStyle={styles.content}
            ListEmptyComponent={
              loadFailure ? (
                loadFailure
              ) : isLoading ? (
                <View style={styles.center}>
                  <ActivityIndicator color={theme.primary} />
                  <AppText variant="caption" color="secondary" style={{ marginTop: Spacing.sm }}>
                    {isAndroid ? 'Scanning SMS and pending inputs...' : 'Loading pending items...'}
                  </AppText>
                </View>
              ) : (
                <EmptyStateView
                  title="Inbox is clear"
                  icon={Icon.Check}
                  subtitle={
                    isAndroid
                      ? 'Try refreshing or loading older messages.'
                      : 'No pending drafts to review.'
                  }
                />
              )
            }
            ListFooterComponent={
              error ? (
                items.length > 0 ? (
                  loadFailure
                ) : null
              ) : hasMore || (isAndroid && hasOlderMessages) || isLoadingMore || isScanningOlder ? (
                <Stack space="lg" style={styles.footer}>
                  {(isLoadingMore || isScanningOlder) && (
                    <ActivityIndicator color={theme.primary} />
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
        visible={Boolean(selectedDuplicateItem)}
        item={selectedDuplicateItem}
        defaultCurrencyCode={defaultCurrencyCode}
        onClose={handleCloseDuplicateModal}
        onMarkDuplicateAndDismiss={handleDismiss}
        onMerge={handleMergeDuplicate}
        onPostAnyway={handleImport}
        onViewJournal={handleViewJournalFromDuplicate}
      />

      <EditReparseSmsModal
        visible={Boolean(selectedEditReparseItem)}
        item={selectedEditReparseItem}
        defaultCurrencyCode={defaultCurrencyCode}
        onClose={handleCloseEditReparseModal}
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
    alignItems: 'center',
  },
  footer: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.sm,
  },
});
