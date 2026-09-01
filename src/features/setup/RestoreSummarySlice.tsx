import { AppButton, AppCard, AppText } from '@/src/components/core';
import { Box, Stack } from '@/src/design-system';
import { ScrollView } from 'react-native';
import type { RestoreHandoff, RestoreSummaryIntent, SetupJourneyId } from './setupTypes';

export function RestoreSummarySlice({
  journeyId,
  handoff,
  isCompleting,
  onIntent,
  onBack,
}: {
  readonly journeyId: SetupJourneyId;
  readonly handoff: RestoreHandoff | undefined;
  readonly isCompleting: boolean;
  readonly onIntent: (intent: RestoreSummaryIntent) => void;
  readonly onBack: () => void;
}) {
  const stats = handoff?.stats;
  const continues = journeyId === 'first_run_restore';
  return (
    <Box flex={1} padding="lg">
      <ScrollView>
        <Stack gap="md">
          <AppText variant="title">Restore is ready</AppText>
          <AppText variant="body" color="secondary">
            {handoff
              ? `${handoff.facts.workplace.name ?? 'Workplace'} was published and is not active yet.`
              : 'Restore publication could not be verified.'}
          </AppText>
          {stats ? (
            <AppCard elevation="sm" paddingSize="md">
              <Stack gap="xs">
                <AppText variant="caption">Accounts {stats.accounts}</AppText>
                <AppText variant="caption">Journals {stats.journals}</AppText>
                <AppText variant="caption">Entries {stats.transactions}</AppText>
                {stats.skippedTransactions > 0 ? (
                  <AppText variant="caption">Skipped {stats.skippedTransactions}</AppText>
                ) : null}
              </Stack>
            </AppCard>
          ) : null}
          {continues ? (
            <AppButton
              variant="primary"
              testID="restore-summary-continue"
              onPress={() => onIntent('continue')}
              loading={isCompleting}
              disabled={!handoff}
            >
              Continue setup
            </AppButton>
          ) : (
            <AppButton
              variant="primary"
              testID="restore-summary-open"
              onPress={() => onIntent('open')}
              loading={isCompleting}
              disabled={!handoff}
            >
              Open workplace
            </AppButton>
          )}
          {journeyId === 'picker_restore' ? (
            <AppButton
              variant="outline"
              onPress={() => onIntent('return_to_picker')}
              disabled={isCompleting}
            >
              Return to picker
            </AppButton>
          ) : null}
          {journeyId === 'settings_restore' ? (
            <AppButton variant="outline" onPress={() => onIntent('stay')} disabled={isCompleting}>
              Stay here
            </AppButton>
          ) : null}
          <AppButton variant="ghost" onPress={() => onIntent('discard')} disabled={isCompleting}>
            Discard
          </AppButton>
          <AppButton variant="ghost" onPress={onBack} disabled={isCompleting}>
            Back
          </AppButton>
        </Stack>
      </ScrollView>
    </Box>
  );
}
