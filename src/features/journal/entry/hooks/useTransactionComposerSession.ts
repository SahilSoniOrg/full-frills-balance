import type { AccountFields } from '@/src/types/plainDtos';
import type {
  TransactionIntent,
  PostingPlan,
  PostingPlanValidationResult,
} from '@/src/types/domainTransaction';
import { EMPTY_ACCOUNT_ID, type WorkplaceId } from '@/src/types/ids';
import { AppConfig } from '@/src/constants';
import { sanitizeAmount } from '@/src/utils/validation';
import { useCurrencies } from '@/src/hooks/use-currencies';
import { useSplitDraftProjection } from '@/src/features/journal/entry/modes/split/splitDraftProjection';
import { useCallback, useMemo } from 'react';
import {
  resolveTransactionIntent,
  validatePostingPlan,
} from '@/src/services/transaction/transactionComposerDomain';
import { buildSimpleDefaultDescription } from '@/src/services/journal/simpleJournalHelpers';
import { useJournalEditor, UseJournalEditorOptions } from './useJournalEditor';

export type UseTransactionComposerSessionOptions = UseJournalEditorOptions & {
  accounts: AccountFields[];
  currencyCode: string;
};

/**
 * Single-transaction session boundary. Editors render projections of this state;
 * the intent and posting plan are derived here so save validation has one home.
 */
export function useTransactionComposerSession(
  workplaceId: WorkplaceId,
  options: UseTransactionComposerSessionOptions,
) {
  const { accounts, currencyCode, ...editorOptions } = options;
  const editor = useJournalEditor(workplaceId, editorOptions);
  const valuationCurrency = editor.valuationCurrency || currencyCode;
  const { currencies } = useCurrencies();
  const precisionByCurrency = useMemo(
    () => new Map(currencies.map(currency => [currency.code.toUpperCase(), currency.precision])),
    [currencies],
  );
  const splitState = useSplitDraftProjection({
    lines: editor.lines,
    accounts,
    workplaceCurrency: valuationCurrency,
  });
  const { sourceLine, destinationLines } = splitState;

  const intent = useMemo<TransactionIntent>(() => {
    const allocationTotal = destinationLines.reduce(
      (sum, line) => sum + (sanitizeAmount(line.amount) ?? 0),
      0,
    );

    const description =
      editor.description.trim() ||
      (editor.isGuidedMode
        ? buildSimpleDefaultDescription(
            editor.transactionType,
            accounts.find(account => account.id === sourceLine?.accountId),
            accounts.find(account => account.id === destinationLines[0]?.accountId),
          )
        : editor.description);

    return {
      description,
      amount:
        sourceLine?.amount ||
        (destinationLines.length > 1 && allocationTotal > 0
          ? String(allocationTotal)
          : destinationLines[0]?.amount),
      date: `${editor.journalDate}T${editor.journalTime || '00:00'}`,
      notes: editor.notes,
      type: editor.transactionType,
      sourceAccountId: sourceLine?.accountId ?? EMPTY_ACCOUNT_ID,
      destinationAccountId: destinationLines[0]?.accountId,
      destinationAmount: destinationLines.length === 1 ? destinationLines[0]?.amount : undefined,
      sourceExchangeRate: sourceLine?.exchangeRate,
      destinationExchangeRate: destinationLines[0]?.exchangeRate,
      allocations:
        destinationLines.length > 1
          ? destinationLines.map(line => ({
              id: line.id,
              accountId: line.accountId,
              amount: line.amount,
              exchangeRate: line.exchangeRate,
              notes: line.notes,
            }))
          : undefined,
    };
  }, [
    accounts,
    destinationLines,
    editor.description,
    editor.isGuidedMode,
    editor.journalDate,
    editor.journalTime,
    editor.notes,
    editor.transactionType,
    sourceLine,
  ]);

  const intentResolution = useMemo(
    () => resolveTransactionIntent(intent, { accounts, currencyCode: valuationCurrency }),
    [accounts, intent, valuationCurrency],
  );

  const postingPlan: PostingPlan | undefined = intentResolution.resolved
    ? intentResolution.plan
    : undefined;

  const planForValidation = useMemo<PostingPlan | undefined>(() => {
    if (editor.isGuidedMode) return postingPlan;
    return {
      lines: editor.lines,
      currencyCode: valuationCurrency,
      description: editor.description.trim() || 'Journal entry',
      date: new Date(`${editor.journalDate}T${editor.journalTime || '00:00'}`).getTime(),
      notes: editor.notes || undefined,
    };
  }, [
    editor.description,
    editor.isGuidedMode,
    editor.journalDate,
    editor.journalTime,
    editor.lines,
    editor.notes,
    postingPlan,
    valuationCurrency,
  ]);
  const postingPlanValidation = useMemo<PostingPlanValidationResult>(
    () =>
      planForValidation
        ? validatePostingPlan(planForValidation, accounts, { precisionByCurrency })
        : { valid: false, issues: [] },
    [accounts, planForValidation, precisionByCurrency],
  );

  // An unresolved intent has no posting plan to validate, so its resolver
  // issues are the canonical explanation for a disabled submit action.
  const validationIssues =
    !editor.isGuidedMode || intentResolution.resolved
      ? postingPlanValidation.issues
      : intentResolution.issues;

  const splitValidation = splitState.validation;

  const submit = useCallback(
    async (mode: 'editor' | 'allocation') => {
      if (mode === 'allocation' && !splitValidation.valid) {
        return { success: false, error: splitValidation.error } as const;
      }

      const description =
        editor.description.trim() ||
        (mode === 'allocation'
          ? editor.transactionType === 'expense'
            ? AppConfig.strings.transactionFlow.splitEntry.defaultDescription
            : buildSimpleDefaultDescription(
                editor.transactionType,
                accounts.find(account => account.id === sourceLine?.accountId),
                accounts.find(account => account.id === destinationLines[0]?.accountId),
              )
          : editor.isGuidedMode
            ? buildSimpleDefaultDescription(
                editor.transactionType,
                accounts.find(account => account.id === sourceLine?.accountId),
                accounts.find(account => account.id === destinationLines[0]?.accountId),
              )
            : `${editor.transactionType.charAt(0).toUpperCase()}${editor.transactionType.slice(1)}`);
      if (!editor.description.trim()) editor.setDescription(description);

      // Advanced mode is the lossless editor for arbitrary journal shapes. A merged
      // journal may contain multiple credit legs; reducing it to the guided intent
      // (one source plus debit allocations) would silently drop those legs on save.
      if (mode === 'editor' && !editor.isGuidedMode) {
        const time = editor.journalTime || '00:00';
        const date = new Date(`${editor.journalDate}T${time}`).getTime();
        return editor.submitPlan(
          {
            lines: editor.lines,
            currencyCode: valuationCurrency,
            description,
            date,
            notes: editor.notes || undefined,
          },
          'advanced',
        );
      }

      const submissionIntent = { ...intent, description };
      const resolution = resolveTransactionIntent(submissionIntent, {
        accounts,
        currencyCode: valuationCurrency,
      });
      if (!resolution.resolved) {
        return {
          success: false,
          error: resolution.issues[0]?.message || 'Invalid transaction',
        } as const;
      }

      return editor.submitPlan(
        resolution.plan,
        mode === 'allocation' ? 'advanced' : editor.isGuidedMode ? 'simple' : 'advanced',
      );
    },
    [accounts, destinationLines, editor, intent, sourceLine, splitValidation, valuationCurrency],
  );

  return {
    editor,
    splitState,
    intent,
    validationIssues,
    postingPlan,
    postingPlanValidation,
    splitValidation,
    submit,
  };
}
