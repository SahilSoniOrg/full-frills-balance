import { AppButton, AppText } from '@/src/components/core';
import { Spacing } from '@/src/constants/design-tokens';
import { Box, Stack } from '@/src/design-system';
import type {
  JournalBalanceLineEdit,
  JournalBalanceReviewEntry,
} from '@/src/domain/accounting/journalBalanceReview';
import { formatDate } from '@/src/utils/dateUtils';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  BalancePreview,
  BalanceReviewLineList,
  ImpliedFxProposalCard,
  JournalBalanceLineEditor,
  lineLabel,
  sameCurrencyImbalanceMessage,
  type BalanceRateLabels,
} from './JournalBalanceReviewParts';

/** Copy that differs between reviewing a backup during restore and reviewing saved entries. */
export interface JournalBalanceReviewCopy {
  untitledEntry: string;
  intro: string;
  suggestionsNote: string;
  fxExplanation: string;
  editorHint: string;
  saveLabel: string;
  applySuggestionsLabel: (count: number) => string;
  rateLabels: BalanceRateLabels;
}

/** The per-entry action beside "Review and edit", e.g. ignoring an entry or opening its editor. */
export interface JournalBalanceEntryAction<Id extends string> {
  testIDSegment: string;
  label: string;
  detailLabel: string;
  variant: 'outline' | 'destructive-outline';
  onPress: (journalId: Id) => void;
}

export interface JournalBalanceReviewFlowProps<Id extends string> {
  entries: readonly JournalBalanceReviewEntry<Id>[];
  isBusy: boolean;
  copy: JournalBalanceReviewCopy;
  testIDPrefix: string;
  entryAction: JournalBalanceEntryAction<Id>;
  onApplyFxSuggestions: (journalIds: Id[]) => void;
  onSaveEdits: (journalId: Id, edits: readonly JournalBalanceLineEdit[]) => void;
  listHeader?: ReactNode;
  listFooter?: ReactNode;
  detailFooter?: ReactNode;
}

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

function EntrySummary<Id extends string>({
  entry,
  untitledEntry,
}: {
  entry: JournalBalanceReviewEntry<Id>;
  untitledEntry: string;
}) {
  const sameCurrency = sameCurrencyImbalanceMessage(entry.currencyCode, entry.lines);
  return (
    <Stack space="xs">
      <AppText variant="body" weight="semibold">
        {entry.description?.trim() || untitledEntry}
      </AppText>
      <AppText variant="caption" color="secondary">
        {`Journal date · ${formatDate(entry.journalDate)}`}
      </AppText>
      <AppText variant="caption" color="error">
        {entry.details || 'This journal is invalid or unbalanced.'}
      </AppText>
      {sameCurrency ? (
        <AppText variant="caption" color="secondary">
          {sameCurrency}
        </AppText>
      ) : null}
    </Stack>
  );
}

/** Lists unbalanced journals, offers safe FX fixes in bulk, and edits one journal at a time. */
export function JournalBalanceReviewFlow<Id extends string>({
  entries,
  isBusy,
  copy,
  testIDPrefix: prefix,
  entryAction,
  onApplyFxSuggestions,
  onSaveEdits,
  listHeader,
  listFooter,
  detailFooter,
}: JournalBalanceReviewFlowProps<Id>) {
  const [selection, setSelection] = useState<{ journalId: Id; editing: boolean }>();
  // A saved entry balances and drops out of `entries`, which returns the flow to the list.
  const selected = selection && entries.find(entry => entry.journalId === selection.journalId);
  const select = (journalId: Id, editing = false) => setSelection({ journalId, editing });

  const fxProposalCard = (entry: JournalBalanceReviewEntry<Id>) =>
    entry.fxProposal ? (
      <ImpliedFxProposalCard
        proposal={entry.fxProposal}
        lines={entry.lines}
        journalCurrency={entry.currencyCode}
        explanation={copy.fxExplanation}
        testID={`${prefix}-implied-fx-rate-${entry.fxProposal.transactionId}`}
      />
    ) : null;

  if (selected) {
    return (
      <Stack space="sm">
        <AppButton variant="ghost" onPress={() => setSelection(undefined)} disabled={isBusy}>
          Back to all entries
        </AppButton>
        <AppText variant="title">Review journal entry</AppText>
        <Box padding="sm" borderRadius="md" background="surfaceSecondary">
          <EntrySummary entry={selected} untitledEntry={copy.untitledEntry} />
        </Box>
        {fxProposalCard(selected)}
        {selected.lines.length > 0 ? (
          <AppText variant="caption" weight="semibold">
            Accounts and posting lines
          </AppText>
        ) : null}
        {selection?.editing ? (
          <JournalBalanceLineEditor
            key={selected.journalId}
            journalCurrency={selected.currencyCode}
            journalDate={selected.journalDate}
            precisionByCurrency={selected.precisionByCurrency}
            lines={selected.lines}
            isBusy={isBusy}
            hint={copy.editorHint}
            saveLabel={copy.saveLabel}
            rateLabels={copy.rateLabels}
            testIDPrefix={`${prefix}-journal`}
            onCancel={() => select(selected.journalId)}
            onSave={edits => onSaveEdits(selected.journalId, edits)}
          />
        ) : (
          <>
            <BalanceReviewLineList journalCurrency={selected.currencyCode} lines={selected.lines} />
            <BalancePreview title="Current balance" evaluation={selected.evaluation} />
            <View style={styles.actions}>
              {selected.lines.length > 0 ? (
                <AppButton
                  variant="secondary"
                  style={styles.actionButton}
                  onPress={() => select(selected.journalId, true)}
                  disabled={isBusy}
                  testID={`${prefix}-journal-edit`}
                >
                  Edit this entry
                </AppButton>
              ) : null}
              <AppButton
                variant={entryAction.variant}
                style={styles.actionButton}
                onPress={() => entryAction.onPress(selected.journalId)}
                disabled={isBusy}
                testID={`${prefix}-journal-${entryAction.testIDSegment}`}
              >
                {entryAction.detailLabel}
              </AppButton>
            </View>
            {detailFooter}
          </>
        )}
      </Stack>
    );
  }

  const suggested = entries.filter(entry => entry.fxProposal?.evaluation.isBalanced === true);
  const suggestedIds = new Set(suggested.map(entry => entry.journalId));
  const needsReview = entries.filter(entry => !suggestedIds.has(entry.journalId));

  return (
    <>
      <AppText variant="title">
        {`${entries.length} journal ${plural(entries.length, 'entry needs', 'entries need')} attention`}
      </AppText>
      <AppText variant="body" color="secondary">
        {copy.intro}
      </AppText>
      {listHeader}

      {suggested.length > 0 ? (
        <Box padding="sm" borderRadius="md" background="surfaceSecondary">
          <Stack space="sm">
            <AppText variant="body" weight="semibold">
              {`A calculated rate can balance ${suggested.length} ${plural(suggested.length, 'entry', 'entries')}`}
            </AppText>
            <AppText variant="caption" color="secondary">
              {copy.suggestionsNote}
            </AppText>
            {suggested.map(entry => (
              <Stack key={entry.journalId} space="xs">
                <AppText variant="caption" weight="semibold">
                  {`${entry.description?.trim() || copy.untitledEntry} · ${formatDate(entry.journalDate)}`}
                </AppText>
                <BalancePreview title="Current balance" evaluation={entry.evaluation} />
                {fxProposalCard(entry)}
                <AppButton
                  variant="secondary"
                  onPress={() => select(entry.journalId)}
                  disabled={isBusy}
                  testID={`${prefix}-review-suggested-fx-${entry.journalId}`}
                >
                  Review or edit this rate
                </AppButton>
              </Stack>
            ))}
            <AppButton
              variant="primary"
              onPress={() => onApplyFxSuggestions(suggested.map(entry => entry.journalId))}
              disabled={isBusy}
              testID={`${prefix}-apply-safe-fx-suggestions`}
            >
              {copy.applySuggestionsLabel(suggested.length)}
            </AppButton>
          </Stack>
        </Box>
      ) : null}

      {needsReview.length > 0 ? (
        <>
          <AppText variant="caption" color="secondary">
            {`${needsReview.length} ${plural(needsReview.length, 'entry needs', 'entries need')} individual review because no single FX rate can safely balance ${plural(needsReview.length, 'it', 'them')}.`}
          </AppText>
          <AppText variant="subheading" weight="semibold">
            Entries needing review
          </AppText>
          {needsReview.map(entry => (
            <Box key={entry.journalId} padding="sm" borderRadius="md" background="surfaceSecondary">
              <Stack space="sm">
                <EntrySummary entry={entry} untitledEntry={copy.untitledEntry} />
                {entry.lines.map(line => (
                  <AppText key={line.id} variant="caption" color="secondary">
                    {`${lineLabel(line)} · ${line.amount} ${line.currency}`}
                  </AppText>
                ))}
                <View style={styles.actions}>
                  <AppButton
                    variant="secondary"
                    style={styles.actionButton}
                    onPress={() => select(entry.journalId)}
                    disabled={isBusy}
                    testID={`${prefix}-journal-review-${entry.journalId}`}
                  >
                    Review and edit
                  </AppButton>
                  <AppButton
                    variant={entryAction.variant}
                    style={styles.actionButton}
                    onPress={() => entryAction.onPress(entry.journalId)}
                    disabled={isBusy}
                    testID={`${prefix}-journal-${entryAction.testIDSegment}-${entry.journalId}`}
                  >
                    {entryAction.label}
                  </AppButton>
                </View>
              </Stack>
            </Box>
          ))}
        </>
      ) : null}
      {listFooter}
    </>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: Spacing.sm },
  actionButton: { flex: 1 },
});
