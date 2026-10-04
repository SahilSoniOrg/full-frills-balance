import { useMemo, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { AppButton, AppText, AppSurface, PressScaleTouchable } from '@/src/components/core';
import { MoneyText } from '@/src/components/shared/MoneyText';
import { Column, Row, Separator } from '@/src/design-system';
import { AppConfig, Size } from '@/src/constants';
import type { EnrichedJournal } from '@/src/types/domainReadModels';
import type {
  PlannedPaymentActivitySummary,
  PlannedPaymentNextOccurrence,
} from '@/src/services/planned-payment/plannedPaymentDetailService';
import type { JournalId } from '@/src/types/ids';
import dayjs from 'dayjs';
import { formatDate } from '@/src/utils/dateUtils';
import { PlannedPaymentHistoryCard } from './PlannedPaymentHistoryCard';
import {
  getPlannedPaymentHistoryPresentation,
  plannedMoneyDiffers,
} from '../hooks/plannedPaymentDetailsPresentation';

const copy = AppConfig.strings.plannedDetailRedesign;

interface Props {
  summary?: PlannedPaymentActivitySummary;
  nextOccurrences?: PlannedPaymentNextOccurrence[];
  showcasedOccurrenceDate?: number;
  cadenceLabel?: string;
  history?: EnrichedJournal[];
  reversalJournalIds?: Set<JournalId>;
  historyLoading?: boolean;
  historyLoadingMore?: boolean;
  hasMore?: boolean;
  startDate?: number;
  ruleAmount: number;
  ruleCurrencyCode: string;
  ruleName: string;
  isPaused?: boolean;
  isEnded?: boolean;
  isLoading?: boolean;
  error?: string;
  onRetry?: () => void;
  onLoadMore?: () => void;
  onOpenJournal: (id: JournalId) => void;
  selectedIds: Set<JournalId>;
  isSelectionModeActive: boolean;
  onLongPressItem: (id: JournalId) => void;
  onToggleSelection: (id: JournalId) => void;
}

export function PlannedPaymentActivityOverview({
  summary,
  nextOccurrences = [],
  showcasedOccurrenceDate,
  cadenceLabel,
  history = [],
  reversalJournalIds,
  historyLoading,
  historyLoadingMore,
  hasMore,
  startDate,
  ruleAmount,
  ruleCurrencyCode,
  ruleName,
  isPaused,
  isEnded,
  isLoading,
  error,
  onRetry,
  onLoadMore,
  onOpenJournal,
  selectedIds,
  isSelectionModeActive,
  onLongPressItem,
  onToggleSelection,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const { fontScale } = useWindowDimensions();
  const largeText = fontScale > 1.3;
  const upcoming = useMemo(
    () =>
      nextOccurrences
        .filter(
          occurrence =>
            showcasedOccurrenceDate == null ||
            dayjs(occurrence.date).startOf('day').valueOf() !==
              dayjs(showcasedOccurrenceDate).startOf('day').valueOf(),
        )
        .slice(0, 3),
    [nextOccurrences, showcasedOccurrenceDate],
  );
  const rows = [...history].sort((a, b) => b.journalDate - a.journalDate);
  const visibleRows = expanded ? rows : rows.slice(0, 3);
  const totalHistoryCount = summary
    ? summary.recordedCount +
      summary.skippedCount +
      summary.reversedCount +
      summary.pendingCount +
      summary.pausedCount
    : rows.length;

  return (
    <Column gap="md">
      {!isPaused && !isEnded && upcoming.length > 0 && (
        <Column gap="sm">
          <Row justify="space-between" align="center" gap="sm" flexWrap="wrap">
            <AppText variant="subheading" weight="semibold">
              {copy.comingUp}
            </AppText>
            <AppText variant="caption" color="secondary">
              {copy.comingUpCadence(cadenceLabel ?? copy.usualAmount)}
            </AppText>
          </Row>
          <Row gap="sm" style={{ flexDirection: largeText ? 'column' : 'row' }}>
            {upcoming.map(occurrence => {
              const differs = plannedMoneyDiffers(
                occurrence.amount,
                occurrence.currencyCode,
                ruleAmount,
                ruleCurrencyCode,
              );
              const label = formatDate(occurrence.date);
              const tile = (
                <AppSurface
                  key={occurrence.date}
                  testID={`planned-upcoming-${occurrence.date}`}
                  elevation="sm"
                  padding="sm"
                  radius="r2"
                  style={
                    largeText
                      ? { width: '100%' }
                      : occurrence.journalId
                        ? { width: '100%', flex: 1 }
                        : { flex: 1, minWidth: 0 }
                  }
                >
                  <Column gap="xs">
                    <AppText variant="body" weight="semibold">
                      {dayjs(occurrence.date).format('MMM D')}
                    </AppText>
                    <AppText variant="caption" color="secondary">
                      {dayjs(occurrence.date).format('dddd')}
                    </AppText>
                    {differs && (
                      <MoneyText
                        amount={occurrence.amount}
                        currencyCode={occurrence.currencyCode}
                        variant="caption"
                      />
                    )}
                  </Column>
                </AppSurface>
              );
              return occurrence.journalId ? (
                <PressScaleTouchable
                  key={occurrence.date}
                  onPress={() => onOpenJournal(occurrence.journalId!)}
                  accessibilityRole="button"
                  accessibilityLabel={copy.occurrenceReview(label)}
                  surfaceStyle={{ minHeight: Size.buttonMd, flex: 1 }}
                  style={largeText ? { width: '100%' } : { flex: 1, minWidth: 0 }}
                >
                  {tile}
                </PressScaleTouchable>
              ) : (
                tile
              );
            })}
          </Row>
        </Column>
      )}

      <Column gap="sm">
        <Row justify="space-between" align="center" gap="sm" flexWrap="wrap">
          <AppText variant="subheading" weight="semibold">
            {copy.history}
          </AppText>
          {(rows.length > 3 || totalHistoryCount > 3 || !!hasMore) && (
            <AppButton
              variant="ghost"
              onPress={() => setExpanded(value => !value)}
              accessibilityRole="button"
              accessibilityLabel={expanded ? copy.showRecent : copy.seeAll(totalHistoryCount)}
              buttonStyle={{ minHeight: 44, paddingHorizontal: 4 }}
            >
              {expanded ? copy.showRecent : copy.seeAll(totalHistoryCount)}
            </AppButton>
          )}
        </Row>
        {error ? (
          <AppSurface elevation="sm" padding="md" radius="r2">
            <Column gap="sm">
              <AppText color="warning" accessibilityRole="alert">
                {error}
              </AppText>
              <AppButton
                variant="secondary"
                onPress={onRetry}
                accessibilityRole="button"
                accessibilityLabel={copy.retryActivity}
              >
                {copy.retryActivity}
              </AppButton>
            </Column>
          </AppSurface>
        ) : isLoading || !summary ? (
          <AppText color="secondary">{copy.loadingActivity}</AppText>
        ) : (
          <AppSurface elevation="sm" padding="none" radius="r2" overflow="hidden">
            <Column>
              <Row
                justify="space-between"
                align="center"
                gap="md"
                paddingHorizontal="md"
                paddingVertical="sm"
              >
                <Column flex={1} gap="xs">
                  {summary.recordedTotals.map(total => (
                    <MoneyText
                      key={total.currencyCode}
                      amount={total.amount}
                      currencyCode={total.currencyCode}
                      variant="title"
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.2}
                    />
                  ))}
                  <AppText variant="caption" color="secondary">
                    {copy.paidIn(summary.recordedCount)}
                    {startDate == null
                      ? ''
                      : ` ${copy.paidSince(dayjs(startDate).format('MMM YYYY'))}`}
                  </AppText>
                </Column>
                <Column align="flex-end" gap="xs">
                  <AppText variant="caption" color="secondary">
                    {copy.skippedCount}
                  </AppText>
                  <AppText variant="body" weight="semibold">
                    {summary.skippedCount}
                  </AppText>
                </Column>
              </Row>
              {(historyLoading || rows.length > 0) && <Separator />}
              {historyLoading ? (
                <Column paddingHorizontal="md" paddingVertical="md">
                  <AppText color="secondary">{copy.loadingHistory}</AppText>
                </Column>
              ) : visibleRows.length ? (
                visibleRows.map(journal => (
                  <PlannedPaymentHistoryCard
                    key={journal.id}
                    journalId={journal.id}
                    journalAmount={journal.totalAmount}
                    currencyCode={journal.currencyCode}
                    journalDate={journal.journalDate}
                    journalTitle={journal.description || journal.semanticLabel || ruleName}
                    plannedTitle={ruleName}
                    plannedAmount={ruleAmount}
                    plannedCurrencyCode={ruleCurrencyCode}
                    presentation={getPlannedPaymentHistoryPresentation(
                      journal,
                      ruleAmount,
                      ruleCurrencyCode,
                      reversalJournalIds?.has(journal.id),
                    )}
                    isSelected={selectedIds.has(journal.id)}
                    isSelectionModeActive={isSelectionModeActive}
                    onLongPress={() => onLongPressItem(journal.id)}
                    onPress={() =>
                      isSelectionModeActive
                        ? onToggleSelection(journal.id)
                        : onOpenJournal(journal.id)
                    }
                  />
                ))
              ) : (
                <Column paddingHorizontal="md" paddingVertical="md">
                  <AppText color="secondary">{copy.noHistory}</AppText>
                </Column>
              )}
              {expanded && hasMore && (
                <AppButton
                  variant="secondary"
                  onPress={onLoadMore}
                  loading={historyLoadingMore}
                  disabled={historyLoadingMore}
                  accessibilityRole="button"
                  accessibilityLabel={copy.loadEarlier}
                  buttonStyle={{ minHeight: 44, margin: 12 }}
                >
                  {copy.loadEarlier}
                </AppButton>
              )}
            </Column>
          </AppSurface>
        )}
      </Column>
    </Column>
  );
}
