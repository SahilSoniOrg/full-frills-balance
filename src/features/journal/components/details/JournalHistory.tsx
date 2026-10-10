import { useState } from 'react';
import { AppText, AppIcon, Icon, IconTile, ListRow, ListGroup } from '@/src/components/core';
import { RevertChangeDialog } from '@/src/components/overlays/RevertChangeDialog';
import { DetailCaptionLink } from '@/src/components/shared/DetailCaptionLink';
import { DetailRow } from '@/src/components/shared/DetailRow';
import { ErrorStateView } from '@/src/components/shared/ErrorStateView';
import { MoneyText } from '@/src/components/shared/MoneyText';
import { useMoneyFormat } from '@/src/components/shared/moneyFormat';
import { useEffectivePrivacyMode } from '@/src/contexts/PrivacyScope';
import { AppConfig, BorderWidth, JOURNAL_DETAILS_LIMITS, Size, Spacing } from '@/src/constants';
import { Box, Inline, Stack } from '@/src/design-system';
import { useHourCyclePrefs } from '@/src/hooks/useHourCyclePrefs';
import { formatDate } from '@/src/utils/dateUtils';
import type { JournalHistoryModel } from '../../journalDetailsPresentation';
import type { JournalHistoryDetail, JournalHistoryEvent } from '../../journalHistoryPresentation';

export function JournalHistory({ history }: { history: JournalHistoryModel }) {
  const [pending, setPending] = useState<JournalHistoryEvent | null>(null);
  const formatMoney = useMoneyFormat();
  const privateMode = useEffectivePrivacyMode();
  const { resolvedHourCycle } = useHourCyclePrefs();
  const strings = AppConfig.strings.journalDetails;
  const { events } = history;
  const renderValue = (value: string | number, detail: JournalHistoryDetail, before = false) => {
    switch (detail.format) {
      case 'money': {
        const currencyCode = before
          ? (detail.beforeCurrencyCode ?? detail.currencyCode)
          : detail.currencyCode;
        if (privateMode) return AppConfig.privacyMask;
        return typeof value === 'number' && currencyCode
          ? formatMoney(value, currencyCode)
          : String(value);
      }
      case 'rate':
        return privateMode ? AppConfig.privacyMask : String(value);
      case 'date':
        return typeof value === 'number'
          ? formatDate(value, { includeTime: true, hourCycle: resolvedHourCycle })
          : String(value);
      case 'text':
        return String(value);
    }
  };
  const { historyDetailLines } = JOURNAL_DETAILS_LIMITS;
  const summary = pending?.detail
    .slice(0, historyDetailLines)
    .map(detail =>
      strings.revertChange(
        detail.field,
        renderValue(detail.after, detail),
        renderValue(detail.before, detail, true),
      ),
    )
    .join('; ');
  return (
    <>
      <ListGroup
        header={strings.history}
        testID="journal-history"
        headerAccessory={
          <DetailCaptionLink label={strings.fullLog} onPress={history.onOpenFullLog} />
        }
        dividerInset="none"
      >
        {history.loading ? (
          <Box padding="md">
            <AppText color="secondary">{AppConfig.strings.common.loading}</AppText>
          </Box>
        ) : history.error ? (
          <ErrorStateView
            variant="inline"
            message={strings.historyUnavailable}
            retryLabel={strings.retry}
            onRetry={history.onRetry}
            style={{ padding: Spacing.lg }}
          />
        ) : events.length === 0 ? (
          history.timestamps.map(row => (
            <DetailRow key={row.label} label={row.label} value={row.value} />
          ))
        ) : (
          <Stack space="none" padding="md">
            {events.map((event, index) => (
              <Inline key={event.id} space="sm" alignItems="stretch">
                <Stack space="none" alignItems="center" width={Size.md}>
                  <IconTile
                    icon={
                      event.kind === 'journal.sms_auto_posted'
                        ? Icon.Check
                        : event.kind === 'journal.created'
                          ? Icon.Plus
                          : Icon.Edit
                    }
                    tint={event.kind === 'journal.sms_auto_posted' ? 'income' : 'textSecondary'}
                    size="sm"
                    shape="circle"
                  />
                  {index < events.length - 1 ? (
                    <Box
                      flex={1}
                      minHeight={Size.xs}
                      width={BorderWidth.medium}
                      background="border"
                    />
                  ) : null}
                </Stack>
                <Stack
                  space="xs"
                  flex={1}
                  minWidth={0}
                  paddingBottom={index < events.length - 1 ? 'md' : 'none'}
                >
                  <Inline space="sm" justifyContent="space-between" flexWrap="wrap">
                    <AppText variant="body" weight="semibold">
                      {event.title}
                    </AppText>
                    <AppText variant="caption" color="secondary">
                      {formatDate(event.timestamp, {
                        includeTime: true,
                        hourCycle: resolvedHourCycle,
                      })}
                    </AppText>
                  </Inline>
                  {event.description ? (
                    <AppText variant="caption" color="secondary">
                      {event.description}
                      {event.amount !== undefined && event.currencyCode ? (
                        <>
                          {' '}
                          ·{' '}
                          <MoneyText
                            amount={event.amount}
                            currencyCode={event.currencyCode}
                            variant="caption"
                            color="secondary"
                          />
                        </>
                      ) : null}
                    </AppText>
                  ) : null}
                  {event.detail.slice(0, historyDetailLines).map((detail, detailIndex) => (
                    <AppText key={detailIndex} variant="caption" color="secondary">
                      {detail.field}{' '}
                      <AppText
                        variant="caption"
                        color="secondary"
                        style={{ textDecorationLine: 'line-through' }}
                      >
                        {renderValue(detail.before, detail, true)}
                      </AppText>
                      {strings.changeArrow}
                      <AppText variant="caption" weight="semibold">
                        {renderValue(detail.after, detail)}
                      </AppText>
                    </AppText>
                  ))}
                  {event.detail.length > historyDetailLines ? (
                    <AppText variant="caption" color="secondary">
                      {strings.more(event.detail.length - historyDetailLines)}
                    </AppText>
                  ) : null}
                  {event.canRevert ? (
                    <DetailCaptionLink
                      label={strings.revert}
                      prefix={strings.revertMark}
                      placement="inline"
                      onPress={() => setPending(event)}
                      testID="journal-revert-change"
                    />
                  ) : null}
                </Stack>
              </Inline>
            ))}
          </Stack>
        )}
        {history.links.map(link => (
          <ListRow
            key={link.label}
            title={link.label}
            minHeight={Size.touchTargetLg}
            onPress={link.onPress}
            trailing={<AppIcon name={Icon.ChevronRight} size={Size.iconXs} color="textSecondary" />}
          />
        ))}
      </ListGroup>
      <RevertChangeDialog
        request={
          pending && {
            logId: pending.id,
            title: strings.revertTitle,
            message: summary ? strings.revertSummary(summary) : strings.revertFallback,
            confirmLabel: strings.revert,
          }
        }
        workplaceId={history.workplaceId}
        surface="journal_details"
        onClose={() => setPending(null)}
      />
    </>
  );
}
