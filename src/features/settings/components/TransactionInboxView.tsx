import { AppButton, AppText, EmptyStateView } from '@/src/components/core';
import { Spacing } from '@/src/constants';
import { Stack } from '@/src/design-system';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import { TransactionInboxItemCardView } from '@/src/features/settings/components/TransactionInboxItemCardView';
import { TransactionInboxViewModel } from '@/src/features/settings/hooks/useTransactionInboxViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import type { ReactNode } from 'react';
import { ActivityIndicator, FlatList, Keyboard, Platform, StyleSheet, View } from 'react-native';

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
    hasMore,
    isScanningOlder,
    handleLoadOlder,
    handleDismiss,
    handleUndismiss,
    handleImport,
    handleCompareDuplicate,
    handleOpenJournal,
    filterButtons,
    defaultCurrencyCode,
  } = vm;

  const isAndroid = Platform.OS === 'android';

  return (
    <SettingsLayout
      title="Transaction Inbox"
      headerActions={headerActions}
      scrollable={false}
      hideFooter
    >
      <View style={styles.container}>
        {!isAndroid && filter === 'pending' ? (
          <View
            style={[
              styles.platformNotice,
              { backgroundColor: theme.surfaceSecondary, borderColor: theme.border },
            ]}
          >
            <AppText variant="caption" color="secondary" style={{ textAlign: 'center' }}>
              Note: SMS transaction scanning is only supported on Android devices. Voice input
              drafts are fully supported.
            </AppText>
          </View>
        ) : null}

        <FlatList
          data={items}
          keyExtractor={item => item.id}
          ListHeaderComponent={
            <View style={styles.filters}>
              {filterButtons.map(button => (
                <AppButton
                  key={button.key}
                  size="sm"
                  variant={filter === button.key ? 'primary' : 'secondary'}
                  onPress={() => {
                    Keyboard.dismiss();
                    setFilter(button.key);
                  }}
                  style={styles.filterButton}
                >
                  {button.label}
                </AppButton>
              ))}
            </View>
          }
          renderItem={({ item }) => (
            <TransactionInboxItemCardView
              item={item}
              currencyCode={defaultCurrencyCode}
              handleDismiss={handleDismiss}
              handleUndismiss={handleUndismiss}
              handleImport={handleImport}
              onCompareDuplicate={handleCompareDuplicate}
              onOpenJournal={handleOpenJournal}
            />
          )}
          contentContainerStyle={styles.content}
          ListEmptyComponent={
            isLoading ? (
              <View style={styles.center}>
                <ActivityIndicator color={theme.primary} />
                <AppText variant="caption" color="secondary" style={{ marginTop: Spacing.sm }}>
                  {isAndroid ? 'Scanning SMS and pending inputs...' : 'Loading pending items...'}
                </AppText>
              </View>
            ) : (
              <EmptyStateView
                title="No pending transactions"
                subtitle={
                  isAndroid
                    ? 'Try refreshing or loading older messages.'
                    : 'Your pending draft queue is empty.'
                }
              />
            )
          }
          ListFooterComponent={
            isAndroid && (hasMore || items.length > 0 || isLoadingMore || isScanningOlder) ? (
              <Stack space="lg" style={styles.footer}>
                {(isLoadingMore || isScanningOlder) && <ActivityIndicator color={theme.primary} />}
                {hasMore && (
                  <AppButton
                    variant="secondary"
                    size="sm"
                    onPress={handleLoadOlder}
                    loading={isScanningOlder}
                  >
                    Load Older Messages
                  </AppButton>
                )}
              </Stack>
            ) : null
          }
        />
      </View>
    </SettingsLayout>
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
  platformNotice: {
    padding: Spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    marginHorizontal: Spacing.xs,
    marginBottom: Spacing.sm,
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
