import { AppText, Badge } from '@/src/components/core';
import {
  JournalAccountFlow,
  type JournalAccountFlowLegAction,
} from '@/src/components/journal/JournalAccountFlow';
import { MoneyText } from '@/src/components/shared/MoneyText';
import { AppConfig, JOURNAL_DETAILS_LAYOUT } from '@/src/constants';
import { Inline, Stack } from '@/src/design-system';
import { accountEntryLeg } from '@/src/services/journal/journalTimelinePresentation';
import type { JournalId } from '@/src/types/ids';
import type { JournalEntryLeg } from '@/src/types/journalEntryCard';
import type {
  JournalEntriesPresentation,
  JournalSplitItemViewModel,
  JournalSummaryModel,
} from '../../journalDetailsPresentation';

const toLegs = (items: JournalSplitItemViewModel[], role: JournalEntryLeg['role']) =>
  items.map(item =>
    accountEntryLeg(
      {
        id: item.accountId,
        name: item.accountName,
        accountType: item.accountType ?? '',
        icon: item.icon,
        color: item.accountColor,
      },
      role,
      item.id,
    ),
  );

export function JournalSummary({
  journalId,
  summary,
  entries,
}: {
  journalId: JournalId;
  summary: JournalSummaryModel;
  entries: JournalEntriesPresentation;
}) {
  const itemsById = new Map([...entries.credits, ...entries.debits].map(item => [item.id, item]));
  const openAccount: JournalAccountFlowLegAction = leg => {
    const item = itemsById.get(leg.id);
    return item
      ? {
          onPress: item.onPress,
          accessibilityLabel: AppConfig.strings.journalDetails.openAccount(item.accountName),
        }
      : undefined;
  };
  return (
    <Stack space="sm" testID={`journal-summary-${journalId}`}>
      <Inline space="sm" alignItems="flex-start" justifyContent="space-between" flexWrap="wrap">
        <AppText
          variant="heading"
          fontRole="ui"
          weight="semibold"
          style={{
            flexGrow: 1,
            flexShrink: 1,
            flexBasis: JOURNAL_DETAILS_LAYOUT.summaryTitleBasis,
          }}
        >
          {summary.description}
        </AppText>
        <Badge variant={summary.statusVariant} size="sm">
          {summary.statusLabel}
        </Badge>
      </Inline>
      {summary.amount !== undefined ? (
        <MoneyText
          amount={summary.amount}
          currencyCode={summary.currencyCode}
          prefix={summary.amountPrefix || undefined}
          variant="title"
          fontRole="display"
          color={summary.amountColor}
        />
      ) : (
        <AppText variant="subheading" color="warning">
          {AppConfig.strings.journalDetails.valueUnavailable}
        </AppText>
      )}
      <AppText variant="caption" color="secondary">
        {summary.dateLine}
      </AppText>
      <JournalAccountFlow
        accountFlow={{
          sources: toLegs(entries.credits, 'SOURCE'),
          destinations: toLegs(entries.debits, 'DESTINATION'),
          neutral: [],
          showCurrencyCodes: false,
        }}
        legAction={openAccount}
      />
    </Stack>
  );
}
