import { AppButton, AppInput, AppText } from '@/src/components/core';
import { Box, Stack } from '@/src/design-system';
import {
  evaluateJournalBalance,
  getValuationIssues,
  normalizeCurrencyCode as normalize,
  type JournalBalanceEvaluation,
  type UniqueJournalFxRateProposal,
} from '@/src/domain/accounting/journalBalanceEvaluator';
import type {
  JournalBalanceLineEdit,
  JournalBalanceReviewLine,
} from '@/src/domain/accounting/journalBalanceReview';
import { resolveJournalFxRate } from '@/src/domain/accounting/journalFx';
import { JournalFxRateEditor } from '@/src/features/journal/entry/components/JournalFxRateEditor';
import type { TransactionType } from '@/src/types/enums';
import { formatDate } from '@/src/utils/dateUtils';
import { formatRoundedAmount, fromMinorUnits } from '@/src/utils/money';
import { useMemo, useState } from 'react';

type BalanceRateSource =
  'imported' | 'implied' | 'historical' | 'manual' | 'converted' | 'missing' | 'invalid';

/** Copy for rate origins that differ between restored backups and saved entries. */
export interface BalanceRateLabels {
  imported: string;
  implied: string;
  invalid: string;
}

type JournalLineDraft = JournalBalanceLineEdit & { rateSource: BalanceRateSource };

function balanceMessage(evaluation: JournalBalanceEvaluation): string {
  if (evaluation.isBalanced) return 'Debits and credits match.';
  const [blockingIssue] = getValuationIssues(evaluation);
  if (blockingIssue) return blockingIssue.message;
  return `Out by ${formatRoundedAmount(
    fromMinorUnits(Math.abs(evaluation.differenceMinorUnits), evaluation.journalPrecision),
    evaluation.journalPrecision,
  )} ${evaluation.journalCurrency}.`;
}

function formatImpliedFxRate(rate: number): string {
  return Number(rate.toPrecision(10)).toString();
}

function lineSideLabel(transactionType: TransactionType): string {
  return transactionType.toLowerCase() === 'debit' ? 'Debit' : 'Credit';
}

export function lineLabel(line: JournalBalanceReviewLine): string {
  return `${lineSideLabel(line.transactionType)} · ${line.accountName || 'Unknown account'}`;
}

export function sameCurrencyImbalanceMessage(
  journalCurrency: string,
  lines: readonly Pick<JournalBalanceReviewLine, 'currency'>[],
): string | undefined {
  const normalizedJournalCurrency = normalize(journalCurrency);
  if (!normalizedJournalCurrency || lines.length === 0) return undefined;
  return lines.every(line => normalize(line.currency) === normalizedJournalCurrency)
    ? `Every posting line uses ${journalCurrency}. Check the amounts; an FX adjustment cannot resolve this same-currency imbalance.`
    : undefined;
}

export function BalancePreview({
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

export function ImpliedFxProposalCard({
  proposal,
  lines,
  journalCurrency,
  explanation,
  testID,
}: {
  proposal: UniqueJournalFxRateProposal;
  lines: readonly JournalBalanceReviewLine[];
  journalCurrency: string;
  explanation: string;
  testID?: string;
}) {
  const currency = lines.find(line => line.id === proposal.transactionId)?.currency ?? '';
  return (
    <Box padding="sm" borderRadius="md" background="surfaceSecondary">
      <Stack space="xs">
        <AppText variant="caption" weight="semibold">
          Suggested FX rate
        </AppText>
        <AppText variant="caption" color="secondary">
          {explanation}
        </AppText>
        <AppText variant="body" testID={testID}>
          {`1 ${currency} = ${formatImpliedFxRate(proposal.exchangeRate)} ${journalCurrency}`}
        </AppText>
        <BalancePreview title="Balance after rate adjustment" evaluation={proposal.evaluation} />
      </Stack>
    </Box>
  );
}

/** Read-only posting lines, highlighting a suggested rate where one exists. */
export function BalanceReviewLineList({
  journalCurrency,
  lines,
}: {
  journalCurrency: string;
  lines: readonly JournalBalanceReviewLine[];
}) {
  return (
    <>
      {lines.map(line => {
        const crossCurrency = normalize(line.currency) !== normalize(journalCurrency);
        const displayRate = line.proposedExchangeRate ?? line.exchangeRate;
        return (
          <Box key={line.id} padding="sm" borderRadius="md" background="surfaceSecondary">
            <Stack space="xs">
              <AppText variant="caption" color="secondary">
                {`${lineLabel(line)} · ${line.currency}`}
              </AppText>
              <AppText variant="body">
                {`${line.amount} ${line.currency}`}
                {crossCurrency && displayRate !== undefined
                  ? ` · ${line.proposedExchangeRate === undefined ? 'rate' : 'suggested rate'} ${displayRate} ${journalCurrency}`
                  : ''}
              </AppText>
            </Stack>
          </Box>
        );
      })}
    </>
  );
}

function initialLineDraft(
  journalCurrency: string,
  line: JournalBalanceReviewLine,
): JournalLineDraft {
  const resolution = resolveJournalFxRate({
    accountCurrency: line.currency,
    journalCurrency,
    importedRate: line.exchangeRate,
  });
  const rateSource: BalanceRateSource =
    line.proposedExchangeRate !== undefined
      ? 'implied'
      : resolution.source === 'identity'
        ? line.exchangeRate === undefined
          ? 'missing'
          : 'imported'
        : resolution.source;
  const exchangeRate =
    line.proposedExchangeRate !== undefined
      ? String(line.proposedExchangeRate)
      : resolution.source === 'identity'
        ? line.exchangeRate === undefined
          ? undefined
          : String(line.exchangeRate)
        : resolution.rate !== undefined
          ? String(resolution.rate)
          : line.exchangeRate === undefined
            ? undefined
            : String(line.exchangeRate);
  return {
    transactionId: line.id,
    amount: String(line.amount),
    ...(exchangeRate === undefined ? {} : { exchangeRate }),
    rateSource,
  };
}

function rateSourceLabel(
  source: BalanceRateSource,
  journalDate: number,
  labels: BalanceRateLabels,
): string {
  switch (source) {
    case 'imported':
      return labels.imported;
    case 'historical':
      return `Historical rate suggestion · ${formatDate(journalDate)}`;
    case 'implied':
      return labels.implied;
    case 'manual':
      return 'Manually adjusted rate';
    case 'converted':
      return 'Rate calculated from converted amount';
    case 'invalid':
      return labels.invalid;
    case 'missing':
      return 'No exchange rate yet';
  }
}

/** Edits the amounts and FX rates of a journal's lines; saving is only allowed once it balances. */
export function JournalBalanceLineEditor({
  journalCurrency,
  journalDate,
  precisionByCurrency,
  lines,
  isBusy,
  hint,
  saveLabel,
  rateLabels,
  testIDPrefix,
  onCancel,
  onSave,
}: {
  journalCurrency: string;
  journalDate: number;
  precisionByCurrency: ReadonlyMap<string, number>;
  lines: readonly JournalBalanceReviewLine[];
  isBusy: boolean;
  hint: string;
  saveLabel: string;
  rateLabels: BalanceRateLabels;
  testIDPrefix: string;
  onCancel: () => void;
  onSave: (edits: readonly JournalBalanceLineEdit[]) => void;
}) {
  const [edits, setEdits] = useState<JournalLineDraft[]>(() =>
    lines.map(line => initialLineDraft(journalCurrency, line)),
  );
  const [error, setError] = useState<string>();
  const evaluation = useMemo(
    () =>
      evaluateJournalBalance({
        journalCurrency,
        precisionByCurrency,
        lines: lines.map((line, index) => ({
          id: line.id,
          accountId: line.accountId,
          accountCurrency: line.accountCurrency,
          amount: edits[index]?.amount ?? String(line.amount),
          exchangeRate: edits[index]?.exchangeRate,
          transactionType: line.transactionType,
        })),
      }),
    [edits, journalCurrency, lines, precisionByCurrency],
  );

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
    onSave(edits.map(({ rateSource: _rateSource, ...edit }) => edit));
  };

  const normalizedJournalCurrency = normalize(journalCurrency);
  return (
    <Stack space="sm">
      {lines.map((line, index) => {
        const normalizedCurrency = normalize(line.currency);
        const crossCurrency = normalizedCurrency !== normalizedJournalCurrency;
        const rateSource = edits[index]?.rateSource ?? 'missing';
        return (
          <Box key={line.id} padding="sm" borderRadius="md" background="surfaceSecondary">
            <Stack space="xs">
              <AppText variant="caption" color="secondary">
                {`${lineLabel(line)} · ${line.currency}`}
              </AppText>
              <AppInput
                label={`Amount (${line.currency})`}
                value={edits[index]?.amount ?? ''}
                onChangeText={value => updateLine(index, { amount: value })}
                keyboardType="decimal-pad"
                selectTextOnFocus
                testID={`${testIDPrefix}-amount-${line.id}`}
              />
              {crossCurrency ? (
                <>
                  <JournalFxRateEditor
                    accountCurrency={line.currency}
                    journalCurrency={journalCurrency}
                    journalDate={journalDate}
                    amount={edits[index]?.amount ?? ''}
                    sourcePrecision={precisionByCurrency.get(normalizedCurrency) ?? 2}
                    journalPrecision={precisionByCurrency.get(normalizedJournalCurrency) ?? 2}
                    exchangeRate={edits[index]?.exchangeRate}
                    onExchangeRateChange={(value, source) =>
                      updateLine(index, { exchangeRate: value, rateSource: source })
                    }
                    testIDPrefix={`${testIDPrefix}-fx-${line.id}`}
                  />
                  <AppText variant="caption" color="tertiary">
                    {rateSourceLabel(rateSource, journalDate, rateLabels)}
                  </AppText>
                </>
              ) : null}
            </Stack>
          </Box>
        );
      })}

      <BalancePreview title="Current draft balance" evaluation={evaluation} />
      <AppText variant="caption" color="secondary">
        {hint}
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
        testID={`${testIDPrefix}-save-edits`}
      >
        {saveLabel}
      </AppButton>
      <AppButton variant="ghost" onPress={onCancel} disabled={isBusy}>
        Cancel editing
      </AppButton>
    </Stack>
  );
}
