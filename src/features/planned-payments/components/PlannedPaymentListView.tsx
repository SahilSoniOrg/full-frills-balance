import {
  AppText,
  EmptyStateView,
  ErrorStateView,
  LoadingView,
  PressScaleTouchable,
} from '@/src/components/core';
import { MoneyText } from '@/src/components/shared/MoneyText';
import { useMoneyFormat } from '@/src/components/shared/moneyFormat';
import { AppConfig, Size, Spacing } from '@/src/constants';
import { PlannedPaymentCard } from '@/src/features/planned-payments/components/PlannedPaymentCard';
import { PlannedPaymentMonthSummary } from '@/src/features/planned-payments/components/PlannedPaymentMonthSummary';
import type { PlannedPaymentListPresentation } from '@/src/features/planned-payments/components/plannedPaymentListTypes';
import { usePlannedListRecord } from '@/src/features/planned-payments/hooks/usePlannedListRecord';
import type {
  PlannedPaymentObligation,
  PlannedPaymentListOccurrence,
} from '@/src/services/planned-payment/plannedPaymentReadService';
import type {
  PlannedPaymentListGroup,
  PlannedPaymentListRow,
} from '@/src/features/planned-payments/hooks/plannedPaymentListPresentation';
import { FlashList } from '@shopify/flash-list';
import dayjs from 'dayjs';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { formatPlannedPaymentInterval } from '@/src/features/planned-payments/hooks/plannedPaymentDetailsPresentation';

export type PlannedPaymentListViewProps = {
  listData: PlannedPaymentListPresentation;
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
  onItemPress: (item: PlannedPaymentObligation) => void;
  onCreate?: () => void;
};

type FeedRow =
  | { kind: 'header'; group: PlannedPaymentListGroup }
  | { kind: 'occurrence'; occurrence: Extract<PlannedPaymentListRow, { kind: 'occurrence' }> }
  | { kind: 'schedule'; payment: PlannedPaymentObligation };

function groupTitle(group: PlannedPaymentListGroup, monthStart: number, nextMonthStart: number) {
  const strings = AppConfig.strings.plannedListRedesign;
  const month = dayjs(monthStart).format('MMMM');
  const nextMonth = dayjs(nextMonthStart).format('MMMM');
  switch (group.key) {
    case 'overdue':
      return strings.groupOverdue;
    case 'next7Days':
      return strings.groupThisWeek;
    case 'laterThisMonth':
      return strings.groupLaterThisMonth(month);
    case 'nextMonth':
      return strings.groupNextMonth(nextMonth);
    case 'later':
      return strings.groupLater;
    case 'pausedEnded':
      return strings.groupPausedEnded(group.rows.length);
  }
}

function groupRows(group: PlannedPaymentListGroup): FeedRow[] {
  if (group.key === 'pausedEnded') {
    if (!group.rows.length) return [];
    return [
      { kind: 'header', group },
      ...group.rows
        .map(row =>
          row.kind === 'schedule' ? ({ kind: 'schedule', payment: row.payment } as const) : null,
        )
        .filter((row): row is Extract<FeedRow, { kind: 'schedule' }> => row !== null),
    ];
  }
  if (!group.rows.length) return [];
  return [
    { kind: 'header', group },
    ...group.rows
      .map(row =>
        row.kind === 'occurrence' ? ({ kind: 'occurrence', occurrence: row } as const) : null,
      )
      .filter((row): row is Extract<FeedRow, { kind: 'occurrence' }> => row !== null),
  ];
}

export function PlannedPaymentListView({
  listData,
  isLoading,
  error,
  onRetry,
  onItemPress,
  onCreate,
}: PlannedPaymentListViewProps) {
  const strings = AppConfig.strings.plannedListRedesign;
  const emptyStrings = AppConfig.strings.plannedPayments;
  const formatMoney = useMoneyFormat({ style: 'compact' });
  const [showPausedEnded, setShowPausedEnded] = useState(false);
  const currentOccurrences = useRef(new Map<string, PlannedPaymentListOccurrence>());
  useLayoutEffect(() => {
    currentOccurrences.current = new Map(
      listData.groups.flatMap(group =>
        group.rows.flatMap(row =>
          row.kind === 'occurrence' && row.canRecord ? [[row.occurrenceId, row] as const] : [],
        ),
      ),
    );
  }, [listData.groups]);
  const isOccurrenceCurrent = useCallback((occurrence: PlannedPaymentListOccurrence) => {
    const current = currentOccurrences.current.get(occurrence.occurrenceId);
    return Boolean(
      current?.canRecord &&
      current.payment.id === occurrence.payment.id &&
      current.date === occurrence.date &&
      current.journalId === occurrence.journalId,
    );
  }, []);
  const { recordOccurrence, pendingIds, pendingPlanIds, errors } =
    usePlannedListRecord(isOccurrenceCurrent);
  const rows = useMemo(
    () =>
      listData.groups
        .flatMap(group => groupRows(group))
        .filter(row => row.kind !== 'schedule' || showPausedEnded),
    [listData.groups, showPausedEnded],
  );

  if (error && listData.groups.every(group => group.rows.length === 0)) {
    return <ErrorStateView message={strings.loadError} onRetry={onRetry} />;
  }

  if (isLoading && listData.groups.every(group => group.rows.length === 0)) {
    return (
      <View style={styles.loadingContainer}>
        <LoadingView loading text={AppConfig.strings.common.loading} />
      </View>
    );
  }

  return (
    <FlashList
      data={rows}
      keyExtractor={row =>
        row.kind === 'header'
          ? `header:${row.group.key}`
          : row.kind === 'occurrence'
            ? row.occurrence.occurrenceId
            : `schedule:${row.payment.id}`
      }
      contentContainerStyle={styles.listContent}
      ListHeaderComponent={<PlannedPaymentMonthSummary listData={listData} />}
      ListEmptyComponent={
        <EmptyStateView
          title={emptyStrings.emptyTitle}
          subtitle={emptyStrings.emptySubtitle}
          primaryActionLabel={onCreate ? emptyStrings.emptyActionLabel : undefined}
          onPrimaryAction={onCreate}
          style={styles.emptyState}
        />
      }
      renderItem={({ item: row }) => {
        if (row.kind === 'header') {
          const group = row.group;
          const isPausedEnded = group.key === 'pausedEnded';
          if (isPausedEnded) {
            return (
              <PressScaleTouchable
                onPress={() => setShowPausedEnded(value => !value)}
                accessibilityRole="button"
                accessibilityLabel={
                  showPausedEnded ? strings.collapsePausedEnded : strings.expandPausedEnded
                }
                accessibilityState={{ expanded: showPausedEnded }}
                style={styles.disclosure}
                surfaceStyle={styles.sectionHeading}
              >
                <AppText variant="bodySmall" weight="medium" color="secondary">
                  {groupTitle(group, listData.monthStart, listData.nextMonthStart)}
                </AppText>
                <AppText variant="body" color="secondary">
                  {showPausedEnded ? '−' : '+'}
                </AppText>
              </PressScaleTouchable>
            );
          }
          return (
            <View style={styles.sectionHeading}>
              <AppText variant="bodySmall" weight="medium" color="secondary">
                {groupTitle(group, listData.monthStart, listData.nextMonthStart)}
              </AppText>
              <View style={styles.subtotal}>
                {group.outgoing.mainCurrency.count > 0 && (
                  <MoneyText
                    amount={group.outgoing.mainCurrency.amount}
                    currencyCode={group.outgoing.mainCurrency.currencyCode}
                    formatStyle="compact"
                    variant="bodySmall"
                    weight="semibold"
                    color="secondary"
                  />
                )}
                {group.outgoing.otherCurrencyCount > 0 &&
                  group.outgoing.perCurrency
                    .filter(
                      total => total.currencyCode !== group.outgoing.mainCurrency.currencyCode,
                    )
                    .map(total => (
                      <View key={total.currencyCode} style={styles.currencySubtotal}>
                        <AppText variant="caption" color="secondary">
                          {total.currencyCode}
                        </AppText>
                        <MoneyText
                          amount={total.amount}
                          currencyCode={total.currencyCode}
                          formatStyle="compact"
                          variant="caption"
                          color="secondary"
                        />
                      </View>
                    ))}
              </View>
            </View>
          );
        }

        if (row.kind === 'schedule') {
          const payment = row.payment;
          const isPaused = payment.status === 'PAUSED';
          const status = isPaused ? strings.paused : strings.ended;
          const cadence =
            payment.intervalType === 'MONTHLY' && payment.intervalN === 1
              ? undefined
              : formatPlannedPaymentInterval(payment);
          return (
            <PressScaleTouchable
              onPress={() => onItemPress(payment)}
              accessibilityRole="button"
              accessibilityLabel={`${payment.name}. ${status}. ${formatMoney(payment.amount, payment.currencyCode)}${cadence ? `. ${cadence}` : ''}`}
              accessibilityHint={strings.rowAccessibilityHint}
              style={styles.scheduleRow}
              surfaceStyle={styles.scheduleSurface}
            >
              <View style={styles.scheduleStatus}>
                <AppText variant="caption" weight="semibold" color="secondary">
                  {isPaused ? 'Ⅱ' : '✓'}
                </AppText>
              </View>
              <View style={styles.scheduleDetails}>
                <AppText variant="body" weight="semibold">
                  {payment.name}
                </AppText>
                <AppText variant="caption" color="secondary">
                  {status}
                  {cadence ? ` · ${cadence}` : ''}
                </AppText>
              </View>
              <MoneyText
                amount={payment.amount}
                currencyCode={payment.currencyCode}
                formatStyle="compact"
                variant="heading"
                weight="bold"
                color="secondary"
                style={styles.scheduleAmount}
              />
            </PressScaleTouchable>
          );
        }

        const occurrence = row.occurrence;
        return (
          <PlannedPaymentCard
            occurrence={occurrence}
            onPress={() => onItemPress(occurrence.payment)}
            onRecord={() => void recordOccurrence(occurrence)}
            canRecord={occurrence.canRecord}
            isRecording={pendingIds.has(occurrence.occurrenceId)}
            isPlanBusy={pendingPlanIds.has(occurrence.payment.id)}
            recordError={errors[occurrence.occurrenceId]}
          />
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
    paddingBottom: Size.fab + Spacing.xxxxl + Size.buttonMd,
  },
  emptyState: { marginTop: Spacing.xxxl },
  sectionHeading: {
    minHeight: 28,
    marginTop: Spacing.xs,
    marginBottom: Spacing.xs,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  subtotal: { alignItems: 'flex-end', flexShrink: 1, flexWrap: 'wrap' },
  currencySubtotal: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: Spacing.xs,
  },
  disclosure: { minHeight: 44, marginTop: Spacing.xs, marginBottom: Spacing.xs },
  scheduleRow: { marginBottom: Spacing.xs },
  scheduleSurface: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm,
    minHeight: 64,
  },
  scheduleStatus: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scheduleDetails: { flexGrow: 1, flexShrink: 1, flexBasis: 160, minWidth: 140, gap: Spacing.xs },
  scheduleAmount: { flexGrow: 1, flexShrink: 1, flexBasis: 100, textAlign: 'right' },
});
