import type { AccountFields } from '@/src/types/plainDtos';
import { useAccountSelection } from '@/src/features/journal/hooks/useAccountSelection';
import {
  buildWorkplaceRowFx,
  getLineRateFetchState,
  useWorkplaceLineEdits,
  type RowFx,
} from '@/src/features/journal/entry/hooks/workplaceRowFx';
import { SplitJournalController } from '@/src/features/journal/entry/modes/split/splitJournalState';
import type { SplitRowState } from '@/src/services/journal/splitJournalHelpers';
import {
  selectSplitDraftLines,
  useSplitDraftProjection,
} from '@/src/features/journal/entry/modes/split/splitDraftProjection';
import { lineAccountPatch, parsePositiveRate } from '@/src/services/journal/journalEditorHelpers';
import { parseSimpleAmountInput } from '@/src/services/journal/simpleJournalHelpers';
import { AccountId, EMPTY_ACCOUNT_ID } from '@/src/types/ids';
import { TabType } from '@/src/types/domainJournal';
import { TransactionType } from '@/src/types/enums';
import { pinnedArchivedAccountIds } from '@/src/utils/accountArchive';
import {
  filterGuidedLegAccounts,
  isAccountAllowedOnGuidedLeg,
} from '@/src/services/journal/guidedJournalAccountEligibility';
import { getInferredAccountType } from '@/src/utils/accountCategory';
import { preferences } from '@/src/services/preferences';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useJournalEditor } from './useJournalEditor';

export interface UseSplitJournalEditorProps {
  accounts: AccountFields[];
  workplaceCurrency: string;
  editor: Pick<
    ReturnType<typeof useJournalEditor>,
    | 'setIsGuidedMode'
    | 'isEdit'
    | 'isSubmitting'
    | 'lines'
    | 'updateLine'
    | 'updateLines'
    | 'fetchRatesForLines'
    | 'setLines'
    | 'addLine'
    | 'transactionType'
    | 'setTransactionType'
    | 'journalDate'
  > &
    Partial<Pick<ReturnType<typeof useJournalEditor>, 'rateFetchStates' | 'valuationCurrency'>>;
}

function normalizeCurrency(currency: string | undefined): string | undefined {
  return currency?.trim().toUpperCase() || undefined;
}

/** Existing same-currency allocations that never stored their own workplace rate. */
function sameCurrencyRateSeeds(
  sourceCurrency: string,
  sourceRate: string | number,
  lines: { id: string; currency: string | undefined; exchangeRate?: string | number }[],
): Record<string, { exchangeRate: string }> {
  const rate = String(sourceRate);
  const updates: Record<string, { exchangeRate: string }> = {};
  lines.forEach(line => {
    if (line.currency !== sourceCurrency || parsePositiveRate(line.exchangeRate) != null) return;
    updates[line.id] = { exchangeRate: rate };
  });
  return updates;
}

export function useSplitJournalEditor({
  accounts,
  workplaceCurrency,
  editor,
}: UseSplitJournalEditorProps): SplitJournalController {
  const initializedRef = useRef(false);
  const seededRef = useRef(false);

  const { setIsGuidedMode, isEdit, isSubmitting, updateLine, updateLines, fetchRatesForLines } =
    editor;

  const { sourceLine, destinationLines } = useMemo(
    () => selectSplitDraftLines(editor.lines),
    [editor.lines],
  );
  const lineSourceAccountId = sourceLine?.accountId ?? EMPTY_ACCOUNT_ID;
  const transactionType = editor.transactionType;

  const setSourceAccountId = useCallback(
    (accountId: AccountId) => {
      if (!sourceLine) return;
      updateLine(
        sourceLine.id,
        lineAccountPatch(
          accountId,
          accounts.find(candidate => candidate.id === accountId),
          getInferredAccountType(transactionType, TransactionType.CREDIT),
        ),
      );
    },
    [accounts, sourceLine, transactionType, updateLine],
  );

  const setTotalAmount = useCallback(
    (amount: string) => {
      if (sourceLine) updateLine(sourceLine.id, { amount });
    },
    [sourceLine, updateLine],
  );

  const addSplitRow = useCallback(() => {
    editor.addLine();
  }, [editor]);
  const removeSplitRow = useCallback(
    (id: string) => {
      editor.setLines(previous => {
        const splitRows = previous.filter(line => line.transactionType === TransactionType.DEBIT);
        const targetIsSplitRow = splitRows.some(line => line.id === id);

        // A split entry must retain at least one allocation row. Keeping the
        // invariant here protects callers beyond the current swipe UI.
        if (!targetIsSplitRow || splitRows.length <= 1) return previous;

        return previous.filter(line => line.id !== id);
      });
    },
    [editor],
  );
  const updateSplitAmounts = useCallback(
    (updates: Record<string, string>) => {
      const lineUpdates = Object.entries(updates).reduce<Record<string, { amount: string }>>(
        (batch, [id, amount]) => {
          batch[id] = { amount };
          return batch;
        },
        {},
      );
      updateLines(lineUpdates);
    },
    [updateLines],
  );

  const pinnedAccountIds = useMemo(() => {
    const selectedIds = [
      lineSourceAccountId !== EMPTY_ACCOUNT_ID ? lineSourceAccountId : undefined,
      ...destinationLines.map(line => line.accountId),
    ].filter((id): id is AccountId => !!id && id !== EMPTY_ACCOUNT_ID);
    return pinnedArchivedAccountIds(selectedIds, accounts);
  }, [accounts, destinationLines, lineSourceAccountId]);

  const { leafAccounts } = useAccountSelection({
    accounts,
    pinnedAccountIds,
  });

  const sourceAccounts = useMemo(
    () => filterGuidedLegAccounts(leafAccounts, transactionType, TransactionType.CREDIT),
    [leafAccounts, transactionType],
  );
  const allocationAccounts = useMemo(
    () => filterGuidedLegAccounts(leafAccounts, transactionType, TransactionType.DEBIT),
    [leafAccounts, transactionType],
  );

  const setTransactionType = useCallback(
    (nextType: TabType) => {
      if (nextType === editor.transactionType) return;

      editor.setTransactionType(nextType);
      const accountsById = new Map(accounts.map(account => [account.id, account]));
      const clearInvalidSelection = (
        line: (typeof editor.lines)[number],
        side: TransactionType,
      ) => {
        if (!line.accountId || line.accountId === EMPTY_ACCOUNT_ID) return;
        const account = accountsById.get(line.accountId);
        if (account && isAccountAllowedOnGuidedLeg(account, nextType, side)) return;

        updateLine(
          line.id,
          lineAccountPatch(EMPTY_ACCOUNT_ID, undefined, getInferredAccountType(nextType, side)),
        );
      };

      if (sourceLine) clearInvalidSelection(sourceLine, TransactionType.CREDIT);
      destinationLines.forEach(line => clearInvalidSelection(line, TransactionType.DEBIT));
    },
    [accounts, destinationLines, editor, sourceLine, updateLine],
  );

  const resolvedSourceAccountId = useMemo(() => {
    if (lineSourceAccountId !== EMPTY_ACCOUNT_ID) return lineSourceAccountId;
    if (isEdit) return EMPTY_ACCOUNT_ID;
    const lastSourceId = preferences.journalNav.lastUsedSourceAccountId;
    if (lastSourceId && sourceAccounts.some(a => a.id === lastSourceId)) {
      return lastSourceId;
    }
    return EMPTY_ACCOUNT_ID;
  }, [isEdit, lineSourceAccountId, sourceAccounts]);

  useEffect(() => {
    if (lineSourceAccountId !== EMPTY_ACCOUNT_ID) return;
    if (resolvedSourceAccountId !== EMPTY_ACCOUNT_ID) {
      setSourceAccountId(resolvedSourceAccountId);
    }
  }, [lineSourceAccountId, resolvedSourceAccountId, setSourceAccountId]);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    setIsGuidedMode(false);
  }, [setIsGuidedMode]);

  const sourceAccount = useMemo(
    () => accounts.find(account => account.id === resolvedSourceAccountId),
    [accounts, resolvedSourceAccountId],
  );
  const displayCurrency = sourceAccount?.currencyCode || workplaceCurrency;
  const splitDraft = useSplitDraftProjection({
    lines: editor.lines,
    accounts,
    workplaceCurrency,
    sourceAccountId: resolvedSourceAccountId,
    precisionCurrency: displayCurrency,
  });
  const { precision, currencyContext, totals, totalAmount, splits } = splitDraft;
  const isValid = splitDraft.validation.valid;

  const sourceCurrency = normalizeCurrency(currencyContext.sourceCurrency);

  const splitFx = useMemo(() => {
    const byId: Record<string, RowFx> = {};
    splits.forEach(split => {
      byId[split.id] = buildWorkplaceRowFx(
        {
          amount: split.amount,
          accountCurrency: split.accountCurrency,
          exchangeRate: split.exchangeRate ?? '',
        },
        workplaceCurrency,
        getLineRateFetchState(
          editor.rateFetchStates ?? {},
          split.id,
          split.accountCurrency,
          editor.valuationCurrency ?? workplaceCurrency,
          editor.journalDate,
        ),
        editor.journalDate,
      );
    });
    return byId;
  }, [
    editor.journalDate,
    editor.rateFetchStates,
    editor.valuationCurrency,
    splits,
    workplaceCurrency,
  ]);

  const sourceFx = useMemo(
    () =>
      buildWorkplaceRowFx(
        {
          amount: totalAmount,
          accountCurrency: sourceCurrency ?? workplaceCurrency,
          exchangeRate: currencyContext.sourceExchangeRate ?? '',
        },
        workplaceCurrency,
        getLineRateFetchState(
          editor.rateFetchStates ?? {},
          sourceLine?.id ?? '',
          sourceCurrency,
          editor.valuationCurrency ?? workplaceCurrency,
          editor.journalDate,
        ),
        editor.journalDate,
      ),
    [
      currencyContext.sourceExchangeRate,
      editor.journalDate,
      editor.rateFetchStates,
      editor.valuationCurrency,
      sourceCurrency,
      sourceLine?.id,
      totalAmount,
      workplaceCurrency,
    ],
  );

  const rowFx = useMemo(() => {
    if (!sourceLine) return splitFx;
    return { ...splitFx, [sourceLine.id]: sourceFx };
  }, [sourceFx, sourceLine, splitFx]);

  const { updateAmount, updateConvertedAmount, resetRate } = useWorkplaceLineEdits(
    rowFx,
    updateLine,
    fetchRatesForLines,
  );

  useEffect(() => {
    if (!isEdit || seededRef.current) return;
    const sourceRate = sourceLine?.exchangeRate;
    if (!sourceCurrency || parsePositiveRate(sourceRate) == null || sourceRate == null) return;
    seededRef.current = true;
    const updates = sameCurrencyRateSeeds(
      sourceCurrency,
      sourceRate,
      destinationLines.map(line => ({
        id: line.id,
        currency: normalizeCurrency(
          accounts.find(candidate => candidate.id === line.accountId)?.currencyCode ||
            line.accountCurrency,
        ),
        exchangeRate: line.exchangeRate,
      })),
    );
    if (Object.keys(updates).length > 0) updateLines(updates);
  }, [accounts, destinationLines, isEdit, sourceCurrency, sourceLine, updateLines]);

  const hasResolvedRates = (fx: RowFx) => !fx.pair.needsBaseRate || fx.pair.status === 'resolved';
  const canEqualize =
    totals.total > 0 &&
    splits.length > 0 &&
    hasResolvedRates(sourceFx) &&
    splits.every(split => {
      const fx = splitFx[split.id];
      return Boolean(fx && hasResolvedRates(fx));
    });

  const updateSplitRow = useCallback(
    (id: string, patch: Partial<Pick<SplitRowState, 'accountId' | 'amount' | 'exchangeRate'>>) => {
      if (patch.accountId !== undefined) {
        const account = accounts.find(candidate => candidate.id === patch.accountId);
        updateLine(id, {
          exchangeRate: '',
          ...lineAccountPatch(
            patch.accountId,
            account,
            getInferredAccountType(transactionType, TransactionType.DEBIT),
          ),
        });
        return;
      }

      const { exchangeRate, ...linePatch } = patch;
      updateLine(id, {
        ...linePatch,
        ...(exchangeRate === undefined ? {} : { exchangeRate: String(exchangeRate) }),
      });
    },
    [accounts, transactionType, updateLine],
  );

  const updateSourceConvertedAmount = useCallback(
    (amount: string) => {
      if (!sourceLine) return;
      updateConvertedAmount(sourceLine.id, amount);
    },
    [sourceLine, updateConvertedAmount],
  );

  const resetSourceRate = useCallback(() => {
    if (!sourceLine) return;
    resetRate(sourceLine.id);
  }, [resetRate, sourceLine]);

  return useMemo(
    () => ({
      transactionType,
      setTransactionType,
      sourceAccountId: splitDraft.sourceAccountId,
      setSourceAccountId,
      totalAmount,
      setTotalAmount,
      splits,
      splitFx,
      sourceFx,
      canEqualize,
      addSplitRow,
      removeSplitRow,
      updateSplitRow,
      updateSplitAmounts,
      updateAmount,
      updateConvertedAmount,
      resetRate,
      updateSourceConvertedAmount,
      resetSourceRate,
      totals,
      isValid,
      validationError: splitDraft.validation.valid ? null : splitDraft.validation.error,
      allAccounts: accounts,
      sourceAccounts,
      allocationAccounts,
      sourceAccount,
      displayCurrency,
      precision,
      journalDate: editor.journalDate,
      currencyContext,
      isSubmitting,
      isValidTotal: parseSimpleAmountInput(totalAmount) > 0,
    }),
    [
      transactionType,
      setTransactionType,
      splitDraft,
      setSourceAccountId,
      totalAmount,
      splits,
      splitFx,
      sourceFx,
      canEqualize,
      addSplitRow,
      removeSplitRow,
      updateSplitRow,
      updateSplitAmounts,
      updateAmount,
      updateConvertedAmount,
      resetRate,
      updateSourceConvertedAmount,
      resetSourceRate,
      totals,
      isValid,
      accounts,
      sourceAccounts,
      allocationAccounts,
      sourceAccount,
      displayCurrency,
      precision,
      editor.journalDate,
      isSubmitting,
      setTotalAmount,
      currencyContext,
    ],
  );
}
