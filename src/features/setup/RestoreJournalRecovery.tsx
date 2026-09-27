import { AppButton, AppText } from '@/src/components/core';
import { Spacing } from '@/src/constants/design-tokens';
import { Box, Stack } from '@/src/design-system';
import type { JournalBalanceReviewEntry } from '@/src/domain/accounting/journalBalanceReview';
import {
  JournalBalanceReviewFlow,
  type JournalBalanceEntryAction,
  type JournalBalanceReviewCopy,
} from '@/src/features/journal';
import type { PreparedRestoreJournalIssueView, RestoreJournalLineEdit } from './pickRestoreSource';
import { useMemo } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

interface RestoreJournalRecoveryProps {
  details: string;
  issues?: readonly PreparedRestoreJournalIssueView[];
  previouslyAppliedChanges?: readonly string[];
  isBusy: boolean;
  onRetry: () => void;
  onApplyFxSuggestions: (journalIds: readonly string[]) => void;
  onIgnore: (journalId: string) => void;
  onSaveEdits: (journalId: string, edits: readonly RestoreJournalLineEdit[]) => void;
}

const RESTORE_COPY: JournalBalanceReviewCopy = {
  untitledEntry: 'Imported journal entry',
  intro:
    'Restore checks every posted entry before saving. Review or ignore entries one at a time, or apply a calculated rate where the imported account amounts uniquely determine it.',
  suggestionsNote:
    'Backup FX rates may be approximate or invalid. These suggestions balance each journal using its imported account amounts, which stay unchanged. Review or edit any rate before applying.',
  fxExplanation:
    'Backup FX rates may be approximate or invalid. This rate is recalculated from the imported account amounts to balance the journal; those amounts stay unchanged. Review or edit it before applying.',
  editorHint:
    'Imported FX rates may be approximate. Edit the amounts or rate below; the journal must balance to apply the changes. Historical rate suggestions use the journal date shown above.',
  saveLabel: 'Apply changes and retry restore',
  applySuggestionsLabel: count =>
    `Apply ${count} suggested ${count === 1 ? 'rate' : 'rates'} and retry`,
  rateLabels: {
    imported: 'Rate from prepared import',
    implied: 'Calculated from imported account amounts',
    invalid: 'Imported rate is invalid',
  },
};

function toReviewEntry(issue: PreparedRestoreJournalIssueView): JournalBalanceReviewEntry {
  return {
    journalId: issue.journal.id,
    description: issue.journal.description ?? undefined,
    journalDate: issue.journal.journalDate,
    currencyCode: issue.journal.currencyCode,
    precisionByCurrency: issue.precisionByCurrency,
    lines: issue.lines.map(
      ({ transaction, accountName, accountCurrency, transactionType, proposedExchangeRate }) => ({
        id: transaction.id,
        accountId: transaction.accountId,
        accountName,
        accountCurrency,
        currency: accountCurrency ?? transaction.currencyCode,
        transactionType,
        amount: transaction.amount,
        exchangeRate: transaction.exchangeRate,
        proposedExchangeRate,
      }),
    ),
    details: issue.details,
    evaluation: issue.evaluation,
    ...(issue.fxProposal ? { fxProposal: issue.fxProposal } : {}),
  };
}

function AppliedChanges({ changes }: { changes: readonly string[] }) {
  if (changes.length === 0) return null;
  return (
    <Box padding="sm" borderRadius="md" background="surfaceSecondary">
      <Stack space="xs">
        <AppText variant="caption" weight="semibold">
          Changes already made during this restore
        </AppText>
        {changes.map((change, index) => (
          <AppText key={`${index}-${change}`} variant="caption" color="secondary">
            {change}
          </AppText>
        ))}
      </Stack>
    </Box>
  );
}

export function RestoreJournalRecovery({
  details,
  issues,
  previouslyAppliedChanges = [],
  isBusy,
  onRetry,
  onApplyFxSuggestions,
  onIgnore,
  onSaveEdits,
}: RestoreJournalRecoveryProps) {
  const entries = useMemo(() => (issues ?? []).map(toReviewEntry), [issues]);
  const ignore = useMemo<JournalBalanceEntryAction<string>>(
    () => ({
      testIDSegment: 'ignore',
      label: 'Ignore',
      detailLabel: 'Ignore this entry',
      variant: 'destructive-outline',
      onPress: onIgnore,
    }),
    [onIgnore],
  );

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      testID="restore-journal-recovery-scroll"
    >
      <Stack space="md">
        {entries.length > 0 ? (
          <JournalBalanceReviewFlow
            entries={entries}
            isBusy={isBusy}
            copy={RESTORE_COPY}
            testIDPrefix="restore"
            entryAction={ignore}
            onApplyFxSuggestions={onApplyFxSuggestions}
            onSaveEdits={onSaveEdits}
            listHeader={<AppliedChanges changes={previouslyAppliedChanges} />}
            listFooter={
              <AppButton
                variant="secondary"
                onPress={onRetry}
                disabled={isBusy}
                testID="restore-journal-retry"
              >
                Retry import
              </AppButton>
            }
            detailFooter={
              <AppButton variant="secondary" onPress={onRetry} disabled={isBusy}>
                Retry after review
              </AppButton>
            }
          />
        ) : (
          <>
            <AppText variant="title">Checking journal entries</AppText>
            <AppText variant="body" color="secondary">
              {details || 'Loading journal details from the prepared backup.'}
            </AppText>
            <AppliedChanges changes={previouslyAppliedChanges} />
            <AppButton
              variant="secondary"
              onPress={onRetry}
              disabled
              testID="restore-journal-retry"
            >
              Retry import
            </AppButton>
          </>
        )}
      </Stack>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingBottom: Spacing.lg,
  },
});
