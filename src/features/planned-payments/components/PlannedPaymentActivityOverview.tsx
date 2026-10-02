import { AppButton, AppText, Icon } from '@/src/components/core';
import { DetailDisclosure } from '@/src/components/shared/DetailDisclosure';
import { MoneyText } from '@/src/components/shared/MoneyText';
import { Column, Row } from '@/src/design-system';
import type {
  PlannedPaymentActivitySummary,
  PlannedPaymentNextOccurrence,
} from '@/src/services/planned-payment/plannedPaymentDetailService';
import type { JournalId } from '@/src/types/ids';
import { PlannedPaymentStatus } from '@/src/types/enums';
import { formatDate, getNow } from '@/src/utils/dateUtils';
import { presentPlannedPaymentDue } from '../hooks/plannedPaymentDetailsPresentation';

interface Props {
  summary?: PlannedPaymentActivitySummary;
  nextOccurrences?: PlannedPaymentNextOccurrence[];
  isLoading?: boolean;
  error?: string;
  onRetry?: () => void;
  onOpenJournal: (id: JournalId) => void;
}

export function PlannedPaymentActivityOverview({
  summary,
  nextOccurrences = [],
  isLoading,
  error,
  onRetry,
  onOpenJournal,
}: Props) {
  return (
    <Column gap="lg">
      <DetailDisclosure
        title="Payment overview"
        icon={Icon.BarChart}
        summary={
          error ??
          (isLoading || !summary
            ? 'Loading payment overview…'
            : `${summary.recordedCount} recorded · ${summary.skippedCount} skipped${summary.overdueCount ? ` · ${summary.overdueCount} overdue` : ''}`)
        }
      >
        <Column gap="md">
          {error ? (
            <>
              <AppText color="warning">{error}</AppText>
              <AppButton variant="secondary" onPress={onRetry}>
                Retry activity
              </AppButton>
            </>
          ) : isLoading || !summary ? (
            <AppText color="secondary">Loading payment overview…</AppText>
          ) : (
            <>
              <Row gap="lg" flexWrap="wrap">
                {[
                  { label: 'Recorded', count: summary.recordedCount },
                  { label: 'Skipped', count: summary.skippedCount },
                  ...(summary.reversedCount
                    ? [{ label: 'Reversed', count: summary.reversedCount }]
                    : []),
                ].map(({ label, count }) => (
                  <Column key={label} gap="xs" flexGrow={1}>
                    <AppText variant="xl" weight="semibold">
                      {count}
                    </AppText>
                    <AppText variant="caption" color="secondary">
                      {label}
                    </AppText>
                  </Column>
                ))}
              </Row>
              {summary.recordedTotals.length > 0 && (
                <Column gap="xs">
                  <AppText variant="caption" color="secondary">
                    Recorded totals · all linked history
                  </AppText>
                  {summary.recordedTotals.map(total => (
                    <Row key={total.currencyCode} gap="sm" align="baseline" flexWrap="wrap">
                      <MoneyText
                        amount={total.amount}
                        currencyCode={total.currencyCode}
                        variant="xl"
                      />
                      <AppText variant="caption" color="secondary">
                        {total.currencyCode}
                      </AppText>
                    </Row>
                  ))}
                  <AppText variant="caption" color="secondary">
                    Excludes skipped and reversed occurrences. Currencies are kept separate.
                  </AppText>
                </Column>
              )}
              {summary.lastRecorded && (
                <AppButton variant="ghost" onPress={() => onOpenJournal(summary.lastRecorded!.id)}>
                  {`Last recorded · ${formatDate(summary.lastRecorded.journalDate)}`}
                </AppButton>
              )}
              {(summary.pendingCount > 0 || summary.pausedCount > 0) && (
                <Column gap="xs">
                  <AppText variant="body">
                    {summary.pendingCount} generated{' '}
                    {summary.pendingCount === 1 ? 'occurrence' : 'occurrences'} waiting to record
                  </AppText>
                  {summary.overdueCount > 0 && (
                    <AppText variant="caption" color="error">
                      {summary.overdueCount} overdue
                    </AppText>
                  )}
                  {summary.pausedCount > 0 && (
                    <AppText variant="caption" color="secondary">
                      {summary.pausedCount} paused{' '}
                      {summary.pausedCount === 1 ? 'occurrence' : 'occurrences'}
                    </AppText>
                  )}
                </Column>
              )}
            </>
          )}
        </Column>
      </DetailDisclosure>
      {!error && !isLoading && nextOccurrences.length > 0 && (
        <DetailDisclosure
          title="Next occurrences"
          icon={Icon.Calendar}
          summary={`${nextOccurrences.length} dates · next ${formatDate(nextOccurrences[0].date)}`}
        >
          <Column gap="sm">
            {nextOccurrences.map(occurrence => {
              const due = presentPlannedPaymentDue(
                { status: PlannedPaymentStatus.ACTIVE, nextDueOccurrence: occurrence.date },
                getNow(),
              );
              const content = (
                <Column gap="xs" flex={1}>
                  <Row gap="sm" align="baseline" justify="space-between" flexWrap="wrap">
                    <AppText weight="medium">{formatDate(occurrence.date)}</AppText>
                    <MoneyText amount={occurrence.amount} currencyCode={occurrence.currencyCode} />
                  </Row>
                  <AppText variant="caption" color={due.color}>
                    {due.label} · {occurrence.journalId ? 'Saved occurrence' : 'From schedule'}
                  </AppText>
                </Column>
              );
              return occurrence.journalId ? (
                <AppButton
                  key={occurrence.date}
                  variant="ghost"
                  accessibilityLabel={`Review occurrence on ${formatDate(occurrence.date)}`}
                  onPress={() => onOpenJournal(occurrence.journalId!)}
                  buttonStyle={{ alignItems: 'stretch' }}
                >
                  {content}
                </AppButton>
              ) : (
                <Column key={occurrence.date} paddingHorizontal="md" paddingVertical="sm">
                  {content}
                </Column>
              );
            })}
            <AppText variant="caption" color="secondary">
              Saved occurrences retain their own amounts. Future dates use the current schedule.
            </AppText>
          </Column>
        </DetailDisclosure>
      )}
    </Column>
  );
}
