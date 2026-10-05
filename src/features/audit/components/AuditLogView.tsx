import {
  AppText,
  EmptyStateView,
  ErrorStateView,
  Icon,
  AppIcon,
  LoadingView,
} from '@/src/components/core';
import { ScreenWithChrome, type ScreenNavChrome } from '@/src/components/layout';
import {
  SelectionPickerSheet,
  type SelectionOption,
} from '@/src/components/filters/SelectionPickerSheet';
import { AppConfig, Size, Spacing } from '@/src/constants';
import { AuditLogItem } from '@/src/features/audit/components/AuditLogItem';
import { AuditLogViewModel } from '@/src/features/audit/hooks/useAuditLogViewModel';
import type {
  AuditEventFilter,
  AuditEntityFilter,
  AuditSourceFilter,
} from '@/src/features/audit/hooks/useAuditLogViewModel';
import { AUDIT_EVENT_TYPES } from '@/src/types/auditEvents';
import { useTheme } from '@/src/hooks/use-theme';
import { FlashList } from '@shopify/flash-list';
import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

const ENTITY_FILTERS: AuditEntityFilter[] = [
  'all',
  ...(Object.keys(AppConfig.strings.audit.entityLabels) as Exclude<AuditEntityFilter, 'all'>[]),
];
const SOURCE_FILTERS: { id: AuditSourceFilter; label: string }[] = [
  { id: null, label: AppConfig.strings.audit.filters.all },
  ...Object.entries(AppConfig.strings.audit.sourceLabels).map(([source, label]) => ({
    id: source as Exclude<AuditSourceFilter, null>,
    label,
  })),
];
const EVENT_FILTERS: SelectionOption<AuditEventFilter>[] = [
  { id: 'all', label: AppConfig.strings.audit.allEvents },
  ...AUDIT_EVENT_TYPES.map(eventType => {
    const entityType = eventType.slice(
      0,
      eventType.indexOf('.'),
    ) as keyof typeof AppConfig.strings.audit.entityLabels;
    const entityLabel = AppConfig.strings.audit.entityLabels[entityType] || entityType;
    const eventLabel = AppConfig.strings.audit.eventLabels[eventType] || eventType;
    return {
      id: eventType,
      label: `${entityLabel} · ${eventLabel}`,
      description: eventType,
    };
  }),
];

export function AuditLogView(vm: AuditLogViewModel & { chrome: ScreenNavChrome }) {
  const { theme } = useTheme();
  const {
    chrome,
    logs,
    hasMore,
    loadMore,
    isLoadingMore,
    loadMoreError,
    entityFilter,
    onEntityFilterChange,
    sourceFilter,
    onSourceFilterChange,
    eventFilter,
    onEventFilterChange,
    correlationFilter,
    onCorrelationFilterChange,
    isExportingHistory,
    archiveExportProgress,
    onExportHistory,
    isFiltered,
    accountMap,
    entityStatusMap,
    workplaceCurrency,
    isLoading,
    error,
    retry,
    expandedIds,
    onToggleExpanded,
    onView,
    onRevert,
  } = vm;
  const [isEventPickerVisible, setEventPickerVisible] = useState(false);
  const eventFilterOptions = useMemo(
    () =>
      entityFilter === 'all'
        ? EVENT_FILTERS
        : EVENT_FILTERS.filter(
            option => option.id === 'all' || option.id.startsWith(`${entityFilter}.`),
          ),
    [entityFilter],
  );
  const selectedEventLabel =
    eventFilterOptions.find(option => option.id === eventFilter)?.label ?? eventFilter;

  const loadOlderControl = (
    <View>
      {loadMoreError && (
        <AppText variant="caption" style={{ color: theme.error, textAlign: 'center' }}>
          {AppConfig.strings.audit.loadOlderFailed}
        </AppText>
      )}
      <TouchableOpacity
        onPress={loadMore}
        disabled={isLoadingMore}
        accessibilityRole="button"
        accessibilityState={{ disabled: isLoadingMore }}
        style={styles.loadMore}
      >
        <AppText variant="body" color="secondary">
          {isLoadingMore
            ? AppConfig.strings.audit.loadOlderLoading
            : AppConfig.strings.audit.loadOlder}
        </AppText>
      </TouchableOpacity>
    </View>
  );

  return (
    <ScreenWithChrome chrome={chrome}>
      <View style={styles.viewContent}>
        {!isFiltered && (
          <View style={styles.archiveActionRow}>
            <AppText variant="caption" color="secondary" style={styles.archiveHelp}>
              {AppConfig.strings.audit.exportHistoryHelp}
            </AppText>
            <TouchableOpacity
              onPress={onExportHistory}
              disabled={isExportingHistory}
              accessibilityRole="button"
              accessibilityState={{ disabled: isExportingHistory }}
              style={[
                styles.archiveAction,
                {
                  backgroundColor: theme.surfaceSecondary,
                  borderColor: theme.divider,
                  opacity: isExportingHistory ? 0.75 : 1,
                },
              ]}
            >
              {isExportingHistory ? (
                <ActivityIndicator size="small" color={theme.primary} />
              ) : (
                <AppIcon name={Icon.Save} size={Size.xs} color={theme.textSecondary} />
              )}
              <AppText variant="caption" weight="semibold">
                {isExportingHistory
                  ? archiveExportProgress
                    ? AppConfig.strings.audit.exportingHistoryProgress(
                        archiveExportProgress.exportedCount,
                        archiveExportProgress.totalAtStart,
                      )
                    : AppConfig.strings.audit.exportingHistory
                  : AppConfig.strings.audit.exportHistory}
              </AppText>
            </TouchableOpacity>
          </View>
        )}
        {error && logs.length === 0 ? (
          <ErrorStateView message="We could not load audit history." onRetry={retry} />
        ) : isLoading ? (
          <LoadingView loading={isLoading} />
        ) : logs.length === 0 &&
          (isFiltered ||
            (entityFilter === 'all' &&
              sourceFilter === null &&
              eventFilter === 'all' &&
              correlationFilter === null)) ? (
          <View style={styles.emptyContainer}>
            <AppIcon name={Icon.Document} size={Size.fab} color={theme.textSecondary} />
            <EmptyStateView
              title={AppConfig.strings.audit.emptyLogs}
              style={styles.emptyStateText}
            />
          </View>
        ) : (
          <>
            {!isFiltered &&
              (logs.length > 0 ||
                entityFilter !== 'all' ||
                sourceFilter !== null ||
                eventFilter !== 'all' ||
                correlationFilter !== null) && (
                <View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.filters}
                  >
                    {ENTITY_FILTERS.map(filter => {
                      const selected = entityFilter === filter;
                      const label =
                        filter === 'all'
                          ? AppConfig.strings.audit.filters.all
                          : AppConfig.strings.audit.filters[filter];
                      return (
                        <TouchableOpacity
                          key={filter}
                          onPress={() => onEntityFilterChange(filter)}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          style={[
                            styles.filterOption,
                            {
                              backgroundColor: selected ? theme.primary : theme.surfaceSecondary,
                              borderColor: selected ? theme.primary : theme.divider,
                            },
                          ]}
                        >
                          <AppText
                            variant="caption"
                            style={{ color: selected ? theme.onPrimary : theme.textSecondary }}
                          >
                            {label}
                          </AppText>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                  <AppText variant="caption" color="secondary" style={styles.sourceFilterLabel}>
                    {AppConfig.strings.audit.sourceFilterLabel}
                  </AppText>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.filters}
                  >
                    {SOURCE_FILTERS.map(filter => {
                      const selected = sourceFilter === filter.id;
                      return (
                        <TouchableOpacity
                          key={filter.id ?? 'all-sources'}
                          onPress={() => onSourceFilterChange(filter.id)}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          style={[
                            styles.filterOption,
                            {
                              backgroundColor: selected ? theme.primary : theme.surfaceSecondary,
                              borderColor: selected ? theme.primary : theme.divider,
                            },
                          ]}
                        >
                          <AppText
                            variant="caption"
                            style={{ color: selected ? theme.onPrimary : theme.textSecondary }}
                          >
                            {filter.label}
                          </AppText>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                  <View style={styles.eventFilterRow}>
                    <AppText variant="caption" color="secondary">
                      {AppConfig.strings.audit.eventFilterLabel}
                    </AppText>
                    <TouchableOpacity
                      onPress={() => setEventPickerVisible(true)}
                      accessibilityRole="button"
                      accessibilityLabel={`${AppConfig.strings.audit.eventFilterLabel}: ${selectedEventLabel}`}
                      style={[
                        styles.filterOption,
                        {
                          backgroundColor:
                            eventFilter !== 'all' ? theme.primary : theme.surfaceSecondary,
                          borderColor: eventFilter !== 'all' ? theme.primary : theme.divider,
                        },
                      ]}
                    >
                      <AppText
                        variant="caption"
                        style={{
                          color: eventFilter !== 'all' ? theme.onPrimary : theme.textSecondary,
                        }}
                      >
                        {selectedEventLabel}
                      </AppText>
                      <AppIcon
                        name={Icon.ChevronDown}
                        size={Size.xs}
                        color={eventFilter !== 'all' ? theme.onPrimary : theme.textSecondary}
                      />
                    </TouchableOpacity>
                  </View>
                  {correlationFilter && (
                    <View style={styles.operationFilterRow}>
                      <AppText variant="caption" color="secondary">
                        {AppConfig.strings.audit.correlationLabel(correlationFilter)}
                      </AppText>
                      <TouchableOpacity
                        onPress={() => onCorrelationFilterChange(null)}
                        accessibilityRole="button"
                        accessibilityLabel={AppConfig.strings.audit.clearCorrelationFilter}
                        style={styles.clearOperationFilter}
                      >
                        <AppIcon name={Icon.Close} size={Size.xs} color={theme.textSecondary} />
                        <AppText variant="caption" color="secondary">
                          {AppConfig.strings.audit.clearCorrelationFilter}
                        </AppText>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
            <SelectionPickerSheet
              visible={isEventPickerVisible}
              title={AppConfig.strings.audit.eventFilterTitle}
              options={eventFilterOptions}
              selectedValue={eventFilter}
              onClose={() => setEventPickerVisible(false)}
              onSelect={onEventFilterChange}
            />
            {logs.length === 0 ? (
              <View style={styles.emptyContainer}>
                <AppIcon name={Icon.Document} size={Size.fab} color={theme.textSecondary} />
                <EmptyStateView
                  title={AppConfig.strings.audit.emptyFilteredLogs}
                  style={styles.emptyStateText}
                />
                {hasMore && loadOlderControl}
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
                    onShowRelated={isFiltered ? undefined : onCorrelationFilterChange}
                    accountMap={accountMap}
                    entityStatusMap={entityStatusMap}
                    workplaceCurrency={workplaceCurrency}
                  />
                )}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.list}
                showsVerticalScrollIndicator={false}
                ListFooterComponent={hasMore ? loadOlderControl : null}
              />
            )}
          </>
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
  archiveActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
  },
  archiveHelp: {
    flex: 1,
  },
  archiveAction: {
    minHeight: Size.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  loadMore: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  filters: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.xs,
  },
  sourceFilterLabel: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.xs,
  },
  eventFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  operationFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
  },
  clearOperationFilter: {
    minHeight: Size.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  filterOption: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
