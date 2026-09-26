import { AppButton, AppInput, AppText } from '@/src/components/core';
import { Spacing } from '@/src/constants/design-tokens';
import { Box, Stack } from '@/src/design-system';
import { JournalFxRateEditor } from '@/src/features/journal';
import {
  evaluateJournalBalance,
  type JournalBalanceEvaluation,
} from '@/src/domain/accounting/journalBalanceEvaluator';
import { resolveJournalFxRate } from '@/src/domain/accounting/journalFx';
import { formatDate } from '@/src/utils/dateUtils';
import { formatRoundedAmount, fromMinorUnits } from '@/src/utils/money';
import type {
  PreparedRestoreJournalIssueView,
  PreparedRestoreJournalView,
  RestoreJournalLineEdit,
} from './pickRestoreSource';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

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

type RateSource =
  'imported' | 'implied' | 'historical' | 'manual' | 'converted' | 'missing' | 'invalid';

type JournalLineDraft = {
  transactionId: string;
  amount: string;
  exchangeRate?: string;
  rateSource: RateSource;
};

function evaluateJournalBalanceForDraft(
  entry: PreparedRestoreJournalView,
  edits: readonly JournalLineDraft[],
): JournalBalanceEvaluation {
  return evaluateJournalBalance({
    journalCurrency: entry.journal.currencyCode,
    precisionByCurrency: entry.precisionByCurrency,
    lines: entry.lines.map(({ transaction, accountCurrency, transactionType }, index) => ({
      id: transaction.id,
      accountId: transaction.accountId,
      accountCurrency,
      amount: edits[index]?.amount ?? String(transaction.amount),
      exchangeRate: edits[index]?.exchangeRate,
      transactionType,
    })),
  });
}

function balanceMessage(evaluation: JournalBalanceEvaluation): string {
  if (evaluation.isBalanced) return 'Debits and credits match.';
  const blockingIssue = evaluation.issues.find(issue => issue.code !== 'unbalanced');
  if (blockingIssue) return blockingIssue.message;
  return `Out by ${formatRoundedAmount(
    fromMinorUnits(Math.abs(evaluation.differenceMinorUnits), evaluation.journalPrecision),
    evaluation.journalPrecision,
  )} ${evaluation.journalCurrency}.`;
}

function formatImpliedFxRate(rate: number): string {
  return Number(rate.toPrecision(10)).toString();
}

function BalancePreview({
  title,
  evaluation,
}: {
  title: string;
  evaluation: JournalBalanceEvaluation;
}) {
  const precision = evaluation.journalPrecision;
  const debit = formatRoundedAmount(
    fromMinorUnits(evaluation.debitTotalMinorUnits, precision),
    precision,
  );
  const credit = formatRoundedAmount(
    fromMinorUnits(evaluation.creditTotalMinorUnits, precision),
    precision,
  );
  return (
    <Box padding="sm" borderRadius="md" background="surfaceSecondary">
      <Stack space="xs">
        <AppText variant="caption" weight="semibold">
          {title}
        </AppText>
        <AppText variant="caption" color="secondary">
          {`Debit ${debit} · Credit ${credit} ${evaluation.journalCurrency}`}
        </AppText>
        <AppText variant="body" color={evaluation.isBalanced ? 'primary' : 'error'}>
          {balanceMessage(evaluation)}
        </AppText>
      </Stack>
    </Box>
  );
}

function rateSourceLabel(source: RateSource, journalDate: number): string {
  switch (source) {
    case 'imported':
      return 'Rate from prepared import';
    case 'historical':
      return `Historical rate suggestion · ${formatDate(journalDate)}`;
    case 'implied':
      return 'Calculated from imported account amounts';
    case 'manual':
      return 'Manually adjusted rate';
    case 'converted':
      return 'Rate calculated from converted amount';
    case 'invalid':
      return 'Imported rate is invalid';
    case 'missing':
      return 'No exchange rate yet';
  }
}

function sameCurrencyImbalanceMessage(entry: PreparedRestoreJournalIssueView): string | undefined {
  const journalCurrency = entry.journal.currencyCode.trim().toUpperCase();
  if (!journalCurrency || entry.lines.length === 0) return undefined;
  const allLinesUseJournalCurrency = entry.lines.every(({ transaction, accountCurrency }) => {
    const currency = (accountCurrency ?? transaction.currencyCode).trim().toUpperCase();
    return currency === journalCurrency;
  });
  return allLinesUseJournalCurrency
    ? `Every posting line uses ${entry.journal.currencyCode}. Check the amounts; an FX adjustment cannot resolve this same-currency imbalance.`
    : undefined;
}

function initialLineDraft(
  entry: PreparedRestoreJournalView,
  line: PreparedRestoreJournalView['lines'][number],
): JournalLineDraft {
  const { transaction, accountCurrency, proposedExchangeRate } = line;
  const currency = accountCurrency ?? transaction.currencyCode;
  const resolution = resolveJournalFxRate({
    accountCurrency: currency,
    journalCurrency: entry.journal.currencyCode,
    importedRate: transaction.exchangeRate,
  });
  const rateSource: RateSource =
    proposedExchangeRate !== undefined
      ? 'implied'
      : resolution.source === 'identity'
        ? transaction.exchangeRate === undefined
          ? 'missing'
          : 'imported'
        : resolution.source;
  const exchangeRate =
    proposedExchangeRate !== undefined
      ? String(proposedExchangeRate)
      : resolution.source === 'identity'
        ? transaction.exchangeRate === undefined
          ? undefined
          : String(transaction.exchangeRate)
        : resolution.rate !== undefined
          ? String(resolution.rate)
          : transaction.exchangeRate === undefined
            ? undefined
            : String(transaction.exchangeRate);
  return {
    transactionId: transaction.id,
    amount: String(transaction.amount),
    ...(exchangeRate === undefined ? {} : { exchangeRate }),
    rateSource,
  };
}

function RestoreJournalLineEditor({
  entry,
  isBusy,
  onCancel,
  onSave,
}: {
  entry: PreparedRestoreJournalView;
  isBusy: boolean;
  onCancel: () => void;
  onSave: (edits: readonly RestoreJournalLineEdit[]) => void;
}) {
  const [edits, setEdits] = useState<JournalLineDraft[]>(() =>
    entry.lines.map(line => initialLineDraft(entry, line)),
  );
  const [error, setError] = useState<string>();
  const evaluation = useMemo(() => evaluateJournalBalanceForDraft(entry, edits), [edits, entry]);

  const updateLine = (index: number, changes: Partial<JournalLineDraft>) => {
    setEdits(current =>
      current.map((line, lineIndex) => (lineIndex === index ? { ...line, ...changes } : line)),
    );
    setError(undefined);
  };

  const saveEdits = () => {
    if (!evaluation.isBalanced) {
      setError('Balance the journal before applying these changes.');
      return;
    }
    onSave(edits);
  };

  return (
    <Stack space="sm">
      {entry.lines.map(({ transaction, accountName, accountCurrency }, index) => {
        const currency = accountCurrency ?? transaction.currencyCode;
        const normalizedCurrency = currency.trim().toUpperCase();
        const normalizedJournalCurrency = entry.journal.currencyCode.trim().toUpperCase();
        const crossCurrency = normalizedCurrency !== normalizedJournalCurrency;
        const side = transaction.transactionType.toLowerCase();
        const sourcePrecision = entry.precisionByCurrency.get(normalizedCurrency) ?? 2;
        const rateSource = edits[index]?.rateSource ?? 'missing';
        return (
          <Box key={transaction.id} padding="sm" borderRadius="md" background="surfaceSecondary">
            <Stack space="xs">
              <AppText variant="caption" color="secondary">
                {`${side === 'debit' ? 'Debit' : 'Credit'} · ${accountName || 'Unknown account'} · ${currency}`}
              </AppText>
              <AppInput
                label={`Amount (${currency})`}
                value={edits[index]?.amount ?? ''}
                onChangeText={value => updateLine(index, { amount: value })}
                keyboardType="decimal-pad"
                selectTextOnFocus
                testID={`restore-journal-amount-${transaction.id}`}
              />
              {crossCurrency ? (
                <>
                  <JournalFxRateEditor
                    accountCurrency={currency}
                    journalCurrency={entry.journal.currencyCode}
                    journalDate={entry.journal.journalDate}
                    amount={edits[index]?.amount ?? ''}
                    sourcePrecision={sourcePrecision}
                    journalPrecision={entry.precisionByCurrency.get(normalizedJournalCurrency) ?? 2}
                    exchangeRate={edits[index]?.exchangeRate}
                    onExchangeRateChange={(value, source) =>
                      updateLine(index, { exchangeRate: value, rateSource: source })
                    }
                    testIDPrefix={`restore-journal-fx-${transaction.id}`}
                  />
                  <AppText variant="caption" color="tertiary">
                    {rateSourceLabel(rateSource, entry.journal.journalDate)}
                  </AppText>
                </>
              ) : null}
            </Stack>
          </Box>
        );
      })}

      <BalancePreview title="Current draft balance" evaluation={evaluation} />
      <AppText variant="caption" color="secondary">
        Imported FX rates may be approximate. Edit the amounts or rate below; the journal must
        balance to apply the changes. Historical rate suggestions use the journal date shown above.
      </AppText>
      {error ? (
        <AppText variant="caption" color="error">
          {error}
        </AppText>
      ) : null}
      <AppButton
        variant="primary"
        onPress={saveEdits}
        disabled={isBusy || !evaluation.isBalanced}
        testID="restore-journal-save-edits"
      >
        Apply changes and retry restore
      </AppButton>
      <AppButton variant="ghost" onPress={onCancel} disabled={isBusy}>
        Cancel editing
      </AppButton>
    </Stack>
  );
}

function ImpliedFxProposal({ entry }: { entry: PreparedRestoreJournalView }) {
  const proposal = entry.fxProposal;
  if (!proposal) return null;
  const line = entry.lines.find(item => item.transaction.id === proposal.transactionId);
  const currency = line?.accountCurrency ?? line?.transaction.currencyCode ?? '';
  return (
    <Box padding="sm" borderRadius="md" background="surfaceSecondary">
      <Stack space="xs">
        <AppText variant="caption" weight="semibold">
          Suggested FX rate
        </AppText>
        <AppText variant="caption" color="secondary">
          Backup FX rates may be approximate or invalid. This rate is recalculated from the imported
          account amounts to balance the journal; those amounts stay unchanged. Review or edit it
          before applying.
        </AppText>
        <AppText variant="body" testID={`restore-implied-fx-rate-${proposal.transactionId}`}>
          {`1 ${currency} = ${formatImpliedFxRate(proposal.exchangeRate)} ${entry.journal.currencyCode}`}
        </AppText>
        <BalancePreview title="Balance after rate adjustment" evaluation={proposal.evaluation} />
      </Stack>
    </Box>
  );
}

function JournalIssueCard({
  entry,
  isBusy,
  onReview,
  onIgnore,
}: {
  entry: PreparedRestoreJournalIssueView;
  isBusy: boolean;
  onReview: () => void;
  onIgnore: () => void;
}) {
  return (
    <Box padding="sm" borderRadius="md" background="surfaceSecondary">
      <Stack space="sm">
        <Stack space="xs">
          <AppText variant="body" weight="semibold">
            {entry.journal.description?.trim() || 'Imported journal entry'}
          </AppText>
          <AppText variant="caption" color="secondary">
            {`Journal date · ${formatDate(entry.journal.journalDate)}`}
          </AppText>
          <AppText variant="caption" color="error">
            {entry.details || 'This journal is invalid or unbalanced.'}
          </AppText>
          {sameCurrencyImbalanceMessage(entry) ? (
            <AppText variant="caption" color="secondary">
              {sameCurrencyImbalanceMessage(entry)}
            </AppText>
          ) : null}
        </Stack>
        {entry.lines.map(({ transaction, accountName, accountCurrency, transactionType }) => {
          const currency = accountCurrency ?? transaction.currencyCode;
          return (
            <AppText key={transaction.id} variant="caption" color="secondary">
              {`${transactionType.toLowerCase() === 'debit' ? 'Debit' : 'Credit'} · ${accountName || 'Unknown account'} · ${transaction.amount} ${currency}`}
            </AppText>
          );
        })}
        <View style={styles.actions}>
          <AppButton
            variant="secondary"
            style={styles.actionButton}
            onPress={onReview}
            disabled={isBusy}
            testID={`restore-journal-review-${entry.journal.id}`}
          >
            Review and edit
          </AppButton>
          <AppButton
            variant="destructive-outline"
            style={styles.actionButton}
            onPress={onIgnore}
            disabled={isBusy}
            testID={`restore-journal-ignore-${entry.journal.id}`}
          >
            Ignore
          </AppButton>
        </View>
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
  const [selection, setSelection] = useState<{
    issues: readonly PreparedRestoreJournalIssueView[];
    journalId: string;
    editing: boolean;
  }>();
  const entries = issues ?? [];
  const selectedEntry =
    selection && selection.issues === issues
      ? entries.find(entry => entry.journal.id === selection.journalId)
      : undefined;
  const editing = selectedEntry !== undefined && selection?.editing === true;
  const safeSuggestions = entries.filter(entry => entry.fxProposal?.evaluation.isBalanced === true);
  const suggestedJournalIds = new Set(safeSuggestions.map(entry => entry.journal.id));
  const reviewEntries = entries.filter(entry => !suggestedJournalIds.has(entry.journal.id));

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      testID="restore-journal-recovery-scroll"
    >
      <Stack space="md">
        {selectedEntry ? (
          <Stack space="sm">
            <AppButton variant="ghost" onPress={() => setSelection(undefined)} disabled={isBusy}>
              Back to all entries
            </AppButton>
            <AppText variant="title">Review journal entry</AppText>
            <AppText variant="body" color="error">
              {selectedEntry.details}
            </AppText>
            {sameCurrencyImbalanceMessage(selectedEntry) ? (
              <AppText variant="caption" color="secondary">
                {sameCurrencyImbalanceMessage(selectedEntry)}
              </AppText>
            ) : null}
            <Box padding="sm" borderRadius="md" background="surfaceSecondary">
              <Stack space="xs">
                <AppText variant="caption" color="secondary">
                  Journal name
                </AppText>
                <AppText variant="body" weight="semibold">
                  {selectedEntry.journal.description?.trim() || 'Imported journal entry'}
                </AppText>
                <AppText variant="caption" color="secondary">
                  {`Journal date · ${formatDate(selectedEntry.journal.journalDate)}`}
                </AppText>
              </Stack>
            </Box>

            <ImpliedFxProposal entry={selectedEntry} />

            {selectedEntry.lines.length > 0 ? (
              <AppText variant="caption" weight="semibold">
                Accounts and posting lines
              </AppText>
            ) : null}
            {editing ? (
              <RestoreJournalLineEditor
                key={selectedEntry.journal.id}
                entry={selectedEntry}
                isBusy={isBusy}
                onCancel={() => setSelection(current => current && { ...current, editing: false })}
                onSave={edits => onSaveEdits(selectedEntry.journal.id, edits)}
              />
            ) : (
              selectedEntry.lines.map(
                ({ transaction, accountName, accountCurrency, proposedExchangeRate }) => {
                  const currency = accountCurrency ?? transaction.currencyCode;
                  const crossCurrency =
                    currency.trim().toUpperCase() !==
                    selectedEntry.journal.currencyCode.trim().toUpperCase();
                  const side = transaction.transactionType.toLowerCase();
                  const displayRate = proposedExchangeRate ?? transaction.exchangeRate;
                  return (
                    <Box
                      key={transaction.id}
                      padding="sm"
                      borderRadius="md"
                      background="surfaceSecondary"
                    >
                      <Stack space="xs">
                        <AppText variant="caption" color="secondary">
                          {`${side === 'debit' ? 'Debit' : 'Credit'} · ${accountName || 'Unknown account'} · ${currency}`}
                        </AppText>
                        <AppText variant="body">
                          {`${transaction.amount} ${currency}`}
                          {crossCurrency && displayRate !== undefined
                            ? ` · ${proposedExchangeRate === undefined ? 'rate' : 'suggested rate'} ${displayRate} ${selectedEntry.journal.currencyCode}`
                            : ''}
                        </AppText>
                      </Stack>
                    </Box>
                  );
                },
              )
            )}
          </Stack>
        ) : (
          <>
            <AppText variant="title">
              {entries.length > 0
                ? `${entries.length} journal ${entries.length === 1 ? 'entry needs' : 'entries need'} attention`
                : 'Checking journal entries'}
            </AppText>
            <AppText variant="body" color="secondary">
              {entries.length > 0
                ? 'Restore checks every posted entry before saving. Review or ignore entries one at a time, or apply a calculated rate where the imported account amounts uniquely determine it.'
                : details || 'Loading journal details from the prepared backup.'}
            </AppText>

            {previouslyAppliedChanges.length > 0 ? (
              <Box padding="sm" borderRadius="md" background="surfaceSecondary">
                <Stack space="xs">
                  <AppText variant="caption" weight="semibold">
                    Changes already made during this restore
                  </AppText>
                  {previouslyAppliedChanges.map((change, index) => (
                    <AppText key={`${index}-${change}`} variant="caption" color="secondary">
                      {change}
                    </AppText>
                  ))}
                </Stack>
              </Box>
            ) : null}

            {safeSuggestions.length > 0 ? (
              <Box padding="sm" borderRadius="md" background="surfaceSecondary">
                <Stack space="sm">
                  <AppText variant="body" weight="semibold">
                    {`A calculated rate can balance ${safeSuggestions.length} ${safeSuggestions.length === 1 ? 'entry' : 'entries'}`}
                  </AppText>
                  <AppText variant="caption" color="secondary">
                    Backup FX rates may be approximate or invalid. These suggestions balance each
                    journal using its imported account amounts, which stay unchanged. Review or edit
                    any rate before applying.
                  </AppText>
                  {safeSuggestions.map(entry => (
                    <Stack key={entry.journal.id} space="xs">
                      <AppText variant="caption" weight="semibold">
                        {`${entry.journal.description?.trim() || 'Imported journal entry'} · ${formatDate(entry.journal.journalDate)}`}
                      </AppText>
                      <BalancePreview title="Current balance" evaluation={entry.evaluation} />
                      <ImpliedFxProposal entry={entry} />
                      <AppButton
                        variant="secondary"
                        onPress={() =>
                          setSelection({
                            issues: entries,
                            journalId: entry.journal.id,
                            editing: false,
                          })
                        }
                        disabled={isBusy}
                        testID={`restore-review-suggested-fx-${entry.journal.id}`}
                      >
                        Review or edit this rate
                      </AppButton>
                    </Stack>
                  ))}
                  <AppButton
                    variant="primary"
                    onPress={() =>
                      onApplyFxSuggestions(safeSuggestions.map(entry => entry.journal.id))
                    }
                    disabled={isBusy}
                    testID="restore-apply-safe-fx-suggestions"
                  >
                    {`Apply ${safeSuggestions.length} suggested ${safeSuggestions.length === 1 ? 'rate' : 'rates'} and retry`}
                  </AppButton>
                </Stack>
              </Box>
            ) : null}

            {reviewEntries.length > 0 ? (
              <AppText variant="caption" color="secondary">
                {`${reviewEntries.length} ${reviewEntries.length === 1 ? 'entry needs' : 'entries need'} individual review because no single FX rate can safely balance ${reviewEntries.length === 1 ? 'it' : 'them'}.`}
              </AppText>
            ) : null}

            {reviewEntries.length > 0 ? (
              <>
                <AppText variant="subheading" weight="semibold">
                  Entries needing review
                </AppText>
                {reviewEntries.map(entry => (
                  <JournalIssueCard
                    key={entry.journal.id}
                    entry={entry}
                    isBusy={isBusy}
                    onReview={() =>
                      setSelection({ issues: entries, journalId: entry.journal.id, editing: false })
                    }
                    onIgnore={() => onIgnore(entry.journal.id)}
                  />
                ))}
              </>
            ) : null}
            <AppButton
              variant="secondary"
              onPress={onRetry}
              disabled={isBusy || entries.length === 0}
              testID="restore-journal-retry"
            >
              Retry import
            </AppButton>
          </>
        )}

        {selectedEntry && !editing ? (
          <>
            {selectedEntry.lines.length ? (
              <View style={styles.actions}>
                <AppButton
                  variant="secondary"
                  style={styles.actionButton}
                  onPress={() => setSelection(current => current && { ...current, editing: true })}
                  disabled={isBusy}
                  testID="restore-journal-edit"
                >
                  Edit this entry
                </AppButton>
                <AppButton
                  variant="destructive-outline"
                  style={styles.actionButton}
                  onPress={() => onIgnore(selectedEntry.journal.id)}
                  disabled={isBusy}
                  testID="restore-journal-ignore"
                >
                  Ignore this entry
                </AppButton>
              </View>
            ) : selectedEntry ? (
              <AppButton
                variant="destructive-outline"
                onPress={() => onIgnore(selectedEntry.journal.id)}
                disabled={isBusy}
                testID="restore-journal-ignore"
              >
                Ignore this entry
              </AppButton>
            ) : null}
            <AppButton variant="secondary" onPress={onRetry} disabled={isBusy}>
              Retry after review
            </AppButton>
          </>
        ) : null}
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
  actions: { flexDirection: 'row', gap: Spacing.sm },
  actionButton: { flex: 1 },
});
