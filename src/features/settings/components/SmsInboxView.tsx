import { AppButton, AppText, EmptyStateView } from '@/src/components/core';
import { Spacing } from '@/src/constants';
import { Stack } from '@/src/design-system';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import { SmsInboxItemCardView } from '@/src/features/settings/components/SmsInboxItemCardView';
import { SmsInboxViewModel } from '@/src/features/settings/hooks/useSmsInboxViewModel';
import { AppNavigation } from '@/src/utils/navigation';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { ActivityIndicator, FlatList, Keyboard, Platform, StyleSheet, View } from 'react-native';

interface SmsInboxViewProps {
  vm: SmsInboxViewModel;
}

export function SmsInboxView({ vm }: SmsInboxViewProps) {
  const { theme } = useTheme();
  const {
    filter,
    setFilter,
    items,
    isLoading,
    isLoadingMore,
    hasMore,
    isRefreshing,
    isScanningOlder,
    handleRefresh,
    handleLoadOlder,
    handleDismiss,
    handleUndismiss,
    handleImport,
    handleCompareDuplicate,
    handleOpenJournal,
    filterButtons,
    defaultCurrencyCode,
  } = vm;

  if (Platform.OS !== 'android') {
    return (
      <SettingsLayout title="SMS Inbox" hideFooter={true}>
        <View style={styles.center}>
          <EmptyStateView
            title="Not Supported"
            subtitle="SMS transaction import is only available on Android devices."
          />
        </View>
      </SettingsLayout>
    );
  }

  return (
    <SettingsLayout
      title="SMS Inbox"
      scrollable={false}
      hideFooter={true}
      headerActions={
        <View style={styles.headerActions}>
          <AppButton variant="ghost" size="sm" onPress={AppNavigation.toSmsRules}>
            Rules
          </AppButton>
          <AppButton variant="ghost" size="sm" loading={isRefreshing} onPress={handleRefresh}>
            Refresh
          </AppButton>
        </View>
      }
    >
      <View style={styles.container}>
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
            <SmsInboxItemCardView
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
                  Scanning SMS inbox...
                </AppText>
              </View>
            ) : (
              <EmptyStateView
                title="No SMS records"
                subtitle="Try refreshing or loading older messages."
              />
            )
          }
          ListFooterComponent={
            hasMore || items.length > 0 || isLoadingMore || isScanningOlder ? (
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
