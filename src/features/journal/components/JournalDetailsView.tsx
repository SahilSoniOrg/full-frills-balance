import { EmptyStateView } from '@/src/components/shared/EmptyStateView';
import { LoadingView } from '@/src/components/shared/LoadingView';
import { AppButton, Icon } from '@/src/components/core';
import { ScreenWithChrome } from '@/src/components/layout';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { Box, Stack } from '@/src/design-system';
import type { JournalDetailsViewModel } from '@/src/features/journal/hooks/useJournalDetailsViewModel';
import { AppConfig } from '@/src/constants';
import { JournalSummary } from './details/JournalSummary';
import { JournalNote } from './details/JournalNote';
import { JournalPlannedActions } from './details/JournalPlannedActions';
import { JournalEntries } from './details/JournalEntries';
import { JournalAccountingIssues } from './details/JournalAccountingIssues';
import { JournalBudgetImpact } from './details/JournalBudgetImpact';
import { JournalSchedule } from './details/JournalSchedule';
import { JournalSource } from './details/JournalSource';
import { JournalHistory } from './details/JournalHistory';
import { JournalRecord } from './details/JournalRecord';

export function JournalDetailsView({
  chrome,
  isLoading,
  details,
  onBack,
}: Pick<JournalDetailsViewModel, 'isLoading' | 'details' | 'onBack'> & {
  chrome: ScreenNavChrome;
}) {
  if (isLoading) {
    return (
      <ScreenWithChrome chrome={chrome} scrollable={false}>
        <LoadingView loading={true} />
      </ScreenWithChrome>
    );
  }

  if (!details) {
    return (
      <ScreenWithChrome chrome={chrome} scrollable={false}>
        <EmptyStateView
          title={AppConfig.strings.journalDetails.missing}
          icon={Icon.Error}
          primaryActionLabel={AppConfig.strings.journalDetails.back}
          onPrimaryAction={onBack}
        />
      </ScreenWithChrome>
    );
  }

  return (
    <ScreenWithChrome
      chrome={chrome}
      scrollable
      scrollViewProps={{ testID: 'journal-details-scroll' }}
    >
      <Box padding="lg" paddingBottom="xxxl">
        <Stack gap="xl">
          <JournalSummary
            journalId={details.journalId}
            summary={details.summary}
            entries={details.entries}
          />
          <JournalNote note={details.note} />
          {details.planned && <JournalPlannedActions planned={details.planned} />}
          <JournalEntries entries={details.entries} />
          {(details.peopleActions?.splitLabel || details.peopleActions?.settlePersonName) && (
            <Stack gap="sm">
              {details.peopleActions?.splitLabel && details.peopleActions.onSplitWithPeople && (
                <AppButton
                  variant="outline"
                  onPress={details.peopleActions.onSplitWithPeople}
                  testID="journal-split-people-button"
                >
                  {details.peopleActions.splitLabel}
                </AppButton>
              )}
              {details.peopleActions?.settlePersonName &&
                details.peopleActions.onSettleWithPerson && (
                  <AppButton
                    variant="secondary"
                    onPress={details.peopleActions.onSettleWithPerson}
                    testID="journal-settle-person-button"
                  >
                    Settle up with {details.peopleActions.settlePersonName}
                  </AppButton>
                )}
            </Stack>
          )}
          <JournalAccountingIssues evaluation={details.balanceEvaluation} />
          <JournalBudgetImpact budget={details.budget} />
          {details.schedule && <JournalSchedule schedule={details.schedule} />}
          <JournalSource source={details.source} />
          <JournalHistory history={details.history} />
          <JournalRecord journalId={details.journalId} />
        </Stack>
      </Box>
    </ScreenWithChrome>
  );
}
