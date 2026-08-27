import type { AccountFields } from '@/src/types/plainDtos';
import type {
  TransactionIntent,
  PostingPlan,
  PostingPlanValidationResult,
} from '@/src/types/domainTransaction';
import { TransactionType } from '@/src/types/enums';
import { EMPTY_ACCOUNT_ID, type WorkplaceId } from '@/src/types/ids';
import { AppConfig } from '@/src/constants';
import { sanitizeAmount } from '@/src/utils/validation';
import { validateSplitState } from '@/src/services/journal/splitJournalHelpers';
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

  // Keep the projections stable while unrelated shell state changes (for example,
  // suggestion visibility or account-picker state). Previously `filter` allocated
  // a new array per render and invalidated every downstream derivation.
  const { sourceLine, destinationLines } = useMemo(
    () => ({
      sourceLine: editor.lines.find(line => line.transactionType === TransactionType.CREDIT),
      destinationLines: editor.lines.filter(line => line.transactionType === TransactionType.DEBIT),
    }),
    [editor.lines],
  );
  const splitState = useMemo(
    () => ({
      sourceAccountId: sourceLine?.accountId ?? EMPTY_ACCOUNT_ID,
      totalAmount: sourceLine?.amount ?? '',
      splits: destinationLines.map(line => ({
        id: line.id,
        accountId: line.accountId,
        amount: line.amount,
      })),
    }),
    [destinationLines, sourceLine],
  );

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
    () => resolveTransactionIntent(intent, { accounts, currencyCode }),
    [accounts, currencyCode, intent],
  );

  const postingPlan: PostingPlan | undefined = intentResolution.resolved
    ? intentResolution.plan
    : undefined;

  const postingPlanValidation = useMemo<PostingPlanValidationResult>(
    () => (postingPlan ? validatePostingPlan(postingPlan, accounts) : { valid: false, issues: [] }),
    [accounts, postingPlan],
  );

  const splitValidation = useMemo(
    () =>
      validateSplitState({
        sourceAccountId: splitState.sourceAccountId,
        totalAmount: splitState.totalAmount,
        splits: splitState.splits,
      }),
    [splitState],
  );

  const submit = useCallback(
    async (mode: 'editor' | 'allocation') => {
      if (mode === 'allocation' && !splitValidation.valid) {
        return { success: false, error: splitValidation.error } as const;
      }

      const description =
        editor.description.trim() ||
        (mode === 'allocation'
          ? AppConfig.strings.transactionFlow.splitEntry.defaultDescription
          : editor.isGuidedMode
            ? buildSimpleDefaultDescription(
                editor.transactionType,
                accounts.find(account => account.id === sourceLine?.accountId),
                accounts.find(account => account.id === destinationLines[0]?.accountId),
              )
            : `${editor.transactionType.charAt(0).toUpperCase()}${editor.transactionType.slice(1)}`);
      if (!editor.description.trim()) editor.setDescription(description);

      const submissionIntent = { ...intent, description };
      const resolution = resolveTransactionIntent(submissionIntent, { accounts, currencyCode });
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
    [accounts, currencyCode, destinationLines, editor, intent, sourceLine, splitValidation],
  );

  return {
    editor,
    splitState,
    intent,
    postingPlan,
    postingPlanValidation,
    splitValidation,
    submit,
  };
}
