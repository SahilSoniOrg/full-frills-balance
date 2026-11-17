import { ScreenSectionHeader } from '@/src/components/shared/ScreenSectionHeader';
import { useMemo, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { AppButton, AppText, AppCard, PressScaleTouchable } from '@/src/components/core';
import { MoneyText } from '@/src/components/shared/MoneyText';
import { JournalCsvExportButton } from '@/src/components/journal/JournalCsvExportButton';
import type { ShareableCsvControl } from '@/src/hooks/useJournalCsvExport';
import { Stack, Inline, Separator } from '@/src/design-system';
import { AppConfig, Size, Typography } from '@/src/constants';
import type { EnrichedJournal } from '@/src/types/domainReadModels';
import type {
  PlannedPaymentActivitySummary,
  PlannedPaymentNextOccurrence,
} from '@/src/services/planned-payment/plannedPaymentDetailService';
import type { JournalId } from '@/src/types/ids';
import dayjs from 'dayjs';
import { formatDate } from '@/src/utils/dateFormatting';
import { PlannedPaymentHistoryCard } from './PlannedPaymentHistoryCard';
import {
  getPlannedPaymentHistoryPresentation,
  plannedMoneyDiffers,
} from '../hooks/plannedPaymentDetailsPresentation';

const TITLE_AMOUNT_FIT = {
  maxFontSize: Typography.roles.title.fontSize,
  minFontSize: Typography.sizes.xl,
  lineHeightRatio: Typography.roles.title.lineHeight / Typography.roles.title.fontSize,
};

const copy = AppConfig.strings.plannedDetailRedesign;

interface Props {
  csvExport?: ShareableCsvControl;
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
  csvExport,
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
    <Stack gap="md">
      {!isPaused && !isEnded && upcoming.length > 0 && (
        <Stack gap="sm">
          <ScreenSectionHeader
            title={copy.comingUp}
            action={
              <AppText variant="caption" color="secondary">
                {copy.comingUpCadence(cadenceLabel ?? copy.usualAmount)}
              </AppText>
            }
          />
          <Inline gap="sm" style={{ flexDirection: largeText ? 'column' : 'row' }}>
            {upcoming.map(occurrence => {
              const differs = plannedMoneyDiffers(
                occurrence.amount,
                occurrence.currencyCode,
                ruleAmount,
                ruleCurrencyCode,
              );
              const label = formatDate(occurrence.date);
              const tile = (
                <AppCard
                  overflow="visible"
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
                  <Stack gap="xs">
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
                  </Stack>
                </AppCard>
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
          </Inline>
        </Stack>
      )}

      <Stack gap="sm">
        <ScreenSectionHeader
          title={copy.history}
          action={
            <Inline align="center" gap="xs">
              <JournalCsvExportButton appearance="label" csvExport={csvExport} />
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
            </Inline>
          }
        />
        {error ? (
          <AppCard overflow="visible" elevation="sm" padding="md" radius="r2">
            <Stack gap="sm">
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
            </Stack>
          </AppCard>
        ) : isLoading || !summary ? (
          <AppText color="secondary">{copy.loadingActivity}</AppText>
        ) : (
          <AppCard elevation="sm" padding="none" radius="r2" overflow="hidden">
            <Stack>
              <Inline
                justify="space-between"
                align="center"
                gap="md"
                paddingHorizontal="md"
                paddingVertical="sm"
              >
                <Stack flex={1} gap="xs">
                  {summary.recordedTotals.map(total => (
                    <MoneyText
                      key={total.currencyCode}
                      amount={total.amount}
                      currencyCode={total.currencyCode}
                      variant="title"
                      fit={TITLE_AMOUNT_FIT}
                    />
                  ))}
                  <AppText variant="caption" color="secondary">
                    {copy.paidIn(summary.recordedCount)}
                    {startDate == null || summary.recordedCount === 0
                      ? ''
                      : ` ${copy.paidSince(dayjs(startDate).format('MMM YYYY'))}`}
                  </AppText>
                </Stack>
                <Stack align="flex-end" gap="xs">
                  <AppText variant="caption" color="secondary">
                    {copy.skippedCount}
                  </AppText>
                  <AppText variant="body" weight="semibold">
                    {summary.skippedCount}
                  </AppText>
                </Stack>
              </Inline>
              {(historyLoading || rows.length > 0) && <Separator />}
              {historyLoading ? (
                <Stack paddingHorizontal="md" paddingVertical="md">
                  <AppText color="secondary">{copy.loadingHistory}</AppText>
                </Stack>
              ) : visibleRows.length ? (
                visibleRows.map(journal => (
                  <PlannedPaymentHistoryCard
                    key={journal.id}
                    testID={`planned-history-${journal.id}`}
                    journalAmount={journal.totalAmount}
                    displayType={journal.displayType}
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
                <Stack paddingHorizontal="md" paddingVertical="md">
                  <AppText color="secondary">{copy.noHistory}</AppText>
                </Stack>
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
            </Stack>
          </AppCard>
        )}
      </Stack>
    </Stack>
  );
}
