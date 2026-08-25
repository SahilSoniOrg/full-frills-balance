import type { AccountFields } from '@/src/types/plainDtos';
import type {
  TransactionIntent,
  PostingPlan,
  PostingPlanValidationResult,
} from '@/src/types/domainTransaction';
import { TransactionType } from '@/src/types/enums';
import type { WorkplaceId } from '@/src/types/ids';
import { AppConfig } from '@/src/constants';
import {
  buildJournalLinesFromSplitState,
  validateSplitState,
} from '@/src/services/journal/splitJournalHelpers';
import dayjs from 'dayjs';
import { useCallback, useMemo } from 'react';
import { validatePostingPlan } from '@/src/services/transaction/transactionComposerDomain';
import { useJournalEditor, UseJournalEditorOptions } from './useJournalEditor';
import { useSplitEntryState } from './useSplitEntryState';

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
  const splitDraft = useSplitEntryState(editor.lines.find(line => line.amount)?.amount);

  const sourceLine = editor.lines.find(line => line.transactionType === TransactionType.CREDIT);
  const destinationLines = editor.lines.filter(
    line => line.transactionType === TransactionType.DEBIT,
  );

  const intent = useMemo<TransactionIntent>(
    () => ({
      description: editor.description,
      amount: sourceLine?.amount || destinationLines[0]?.amount,
      date: editor.journalDate,
      notes: editor.notes,
      type: editor.transactionType,
      sourceAccountId: sourceLine?.accountId,
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
    }),
    [
      destinationLines,
      editor.description,
      editor.journalDate,
      editor.notes,
      editor.transactionType,
      sourceLine,
    ],
  );

  const postingPlan = useMemo<PostingPlan>(
    () => ({
      lines: editor.lines,
      currencyCode,
      description: editor.description,
      date: dayjs(`${editor.journalDate}T${editor.journalTime}`).valueOf(),
      notes: editor.notes,
    }),
    [
      currencyCode,
      editor.description,
      editor.journalDate,
      editor.journalTime,
      editor.lines,
      editor.notes,
    ],
  );

  const postingPlanValidation = useMemo<PostingPlanValidationResult>(
    () => validatePostingPlan(postingPlan, accounts),
    [accounts, postingPlan],
  );

  const submit = useCallback(
    async (mode: 'editor' | 'allocation') => {
      if (mode === 'editor') return editor.submit();

      const splitValidation = validateSplitState({
        sourceAccountId: splitDraft.sourceAccountId,
        totalAmount: splitDraft.totalAmount,
        splits: splitDraft.splits,
      });
      if (!splitValidation.valid) {
        return { success: false, error: splitValidation.error } as const;
      }

      const lines = buildJournalLinesFromSplitState({
        sourceAccountId: splitDraft.sourceAccountId,
        sourceAmount: splitDraft.totalAmount,
        splits: splitDraft.splits,
        accounts,
      });
      const description =
        editor.description.trim() ||
        AppConfig.strings.transactionFlow.splitEntry.defaultDescription;
      if (!editor.description.trim()) editor.setDescription(description);

      return editor.submit({ description, lines });
    },
    [accounts, editor, splitDraft],
  );

  return {
    editor,
    splitDraft,
    intent,
    postingPlan,
    postingPlanValidation,
    submit,
  };
}
