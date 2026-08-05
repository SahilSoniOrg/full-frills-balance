import { AppIcon, EmptyStateView, LoadingView } from '@/src/components/core';
import { ScreenWithChrome, type ScreenNavChrome } from '@/src/components/layout';
import { AppConfig, Size, Spacing } from '@/src/constants';
import { AuditLogItem } from '@/src/features/audit/components/AuditLogItem';
import { AuditLogViewModel } from '@/src/features/audit/hooks/useAuditLogViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import { FlashList } from '@shopify/flash-list';
import { StyleSheet, View } from 'react-native';

export function AuditLogView(vm: AuditLogViewModel & { chrome: ScreenNavChrome }) {
  const { theme } = useTheme();
  const {
    chrome,
    logs,
    accountMap,
    entityStatusMap,
    workplaceCurrency,
    isLoading,
    expandedIds,
    onToggleExpanded,
    onView,
    onRevert,
  } = vm;

  return (
    <ScreenWithChrome chrome={chrome}>
      <View style={styles.viewContent}>
        {isLoading ? (
          <LoadingView loading={isLoading} />
        ) : logs.length === 0 ? (
          <View style={styles.emptyContainer}>
            <AppIcon name="document" size={Size.fab} color={theme.textSecondary} />
            <EmptyStateView
              title={AppConfig.strings.audit.emptyLogs}
              style={styles.emptyStateText}
            />
          </View>
        ) : (
          <FlashList
            data={logs}
            renderItem={({ item }) => (
              <AuditLogItem
                item={item}
                isExpanded={expandedIds.has(item.id)}
                onToggle={() => onToggleExpanded(item.id)}
                onView={onView}
                onRevert={onRevert}
                accountMap={accountMap}
                entityStatusMap={entityStatusMap}
                workplaceCurrency={workplaceCurrency}
              />
            )}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    </ScreenWithChrome>
  );
}

const styles = StyleSheet.create({
  viewContent: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.md,
  },
  emptyStateText: {
    flex: 0,
    paddingTop: 0,
  },
  list: {
    padding: Spacing.md,
  },
});
