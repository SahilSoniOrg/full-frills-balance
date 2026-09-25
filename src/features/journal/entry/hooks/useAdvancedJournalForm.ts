import { withConvertedAmount } from '@/src/features/journal/entry/fxPair';
import { formatManualBaseRate } from '@/src/features/journal/entry/manualBaseRate';
import { buildAdvancedRowFx } from '@/src/features/journal/entry/modes/advanced/advancedRowFx';
import type { SplitRowFx } from '@/src/features/journal/entry/modes/split/splitJournalState';
import { useAccountSelection } from '@/src/features/journal/hooks/useAccountSelection';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';
import { JournalCalculator } from '@/src/services/accounting/JournalCalculator';
import { lineAccountPatch, parsePositiveRate } from '@/src/services/journal/journalEditorHelpers';
import {
  distributeSplitRemainder,
  equalizeSplitAmounts,
  getSplitCurrencyPrecision,
  type SplitCurrencyContext,
  type SplitRowState,
} from '@/src/services/journal/splitJournalHelpers';
import { AccountType, TransactionType } from '@/src/types/enums';
import type { JournalEntryLine } from '@/src/types/domainJournal';
import { EMPTY_ACCOUNT_ID, type AccountId } from '@/src/types/ids';
import type { AccountFields } from '@/src/types/plainDtos';
import { pinnedArchivedAccountIds } from '@/src/utils/accountArchive';
import { formatRoundedAmount } from '@/src/utils/money';
import { useCallback, useMemo } from 'react';

type Editor = Pick<
  ReturnType<typeof useJournalEditor>,
  'lines' | 'addLine' | 'removeLine' | 'updateLine' | 'updateLines' | 'fetchRatesForLines'
>;

export interface AdvancedJournalFormController {
  fromLines: JournalEntryLine[];
  toLines: JournalEntryLine[];
  rowFx: Record<string, SplitRowFx>;
  accounts: AccountFields[];
  fromTotal: number;
  toTotal: number;
  /** From total minus To total, in the workplace currency. Positive means left to allocate. */
  remaining: number;
  isBalanced: boolean;
  canEqualize: boolean;
  canDistribute: boolean;
  workplaceCurrency: string;
  addFromLine: () => void;
  addToLine: () => void;
  removeLine: (id: string) => void;
  canRemoveFrom: boolean;
  canRemoveTo: boolean;
  selectAccount: (id: string, accountId: AccountId) => void;
  updateAmount: (id: string, amount: string) => void;
  updateNotes: (id: string, notes: string) => void;
  updateConvertedAmount: (id: string, amount: string) => void;
  resetRate: (id: string) => void;
  equalizeToLines: () => void;
  distributeToLines: () => void;
  moveLine: (id: string) => void;
}

export function useAdvancedJournalForm({
  editor,
  accounts,
  workplaceCurrency,
}: {
  editor: Editor;
  accounts: AccountFields[];
  workplaceCurrency: string;
}): AdvancedJournalFormController {
  const {
    lines,
    addLine,
    removeLine: removeEditorLine,
    updateLine,
    updateLines,
    fetchRatesForLines,
  } = editor;

  const fromLines = useMemo(
    () => lines.filter(line => line.transactionType === TransactionType.CREDIT),
    [lines],
  );
  const toLines = useMemo(
    () => lines.filter(line => line.transactionType === TransactionType.DEBIT),
    [lines],
  );

  const pinnedAccountIds = useMemo(() => {
    const selectedIds = lines
      .map(line => line.accountId)
      .filter((id): id is AccountId => !!id && id !== EMPTY_ACCOUNT_ID);
    return pinnedArchivedAccountIds(selectedIds, accounts);
  }, [accounts, lines]);

  const { leafAccounts } = useAccountSelection({ accounts, pinnedAccountIds });

  const rowFx = useMemo(() => {
    const byId: Record<string, SplitRowFx> = {};
    lines.forEach(line => {
      byId[line.id] = buildAdvancedRowFx(line, workplaceCurrency);
    });
    return byId;
  }, [lines, workplaceCurrency]);

  const fromTotal = useMemo(
    () =>
      fromLines.reduce(
        (sum, line) => sum + JournalCalculator.getLineBaseAmount(line, workplaceCurrency),
        0,
      ),
    [fromLines, workplaceCurrency],
  );
  const toTotal = useMemo(
    () =>
      toLines.reduce(
        (sum, line) => sum + JournalCalculator.getLineBaseAmount(line, workplaceCurrency),
        0,
      ),
    [toLines, workplaceCurrency],
  );

  const journalLines = useMemo(
    () =>
      lines.map(line => ({
        amount: line.amount,
        type: line.transactionType,
        exchangeRate: line.exchangeRate,
        accountCurrency: line.accountCurrency,
      })),
    [lines],
  );
  const isBalanced = JournalCalculator.isBalanced(journalLines, workplaceCurrency);
  const remaining = fromTotal - toTotal;
  const precision = getSplitCurrencyPrecision(workplaceCurrency);
  const allocationContext = useMemo<SplitCurrencyContext>(
    () => ({
      baseCurrency: workplaceCurrency,
      sourceCurrency: workplaceCurrency,
      sourceExchangeRate: 1,
      basePrecision: precision,
    }),
    [precision, workplaceCurrency],
  );
  const toSplitRows = useMemo<SplitRowState[]>(
    () =>
      toLines.map(line => {
        const currency = line.accountCurrency || workplaceCurrency;
        return {
          id: line.id,
          accountId: line.accountId,
          amount: line.amount,
          accountCurrency: currency,
          exchangeRate: line.exchangeRate,
          precision: getSplitCurrencyPrecision(currency),
        };
      }),
    [toLines, workplaceCurrency],
  );

  const toRowsHaveRates = toSplitRows.every(row => {
    const currency = row.accountCurrency?.trim().toUpperCase();
    const base = workplaceCurrency.trim().toUpperCase();
    if (!currency || currency === base) return true;
    return parsePositiveRate(row.exchangeRate) != null;
  });

  const applyToAmounts = useCallback(
    (nextRows: SplitRowState[]) => {
      const updates: Record<string, Partial<JournalEntryLine>> = {};
      nextRows.forEach(row => {
        const current = toLines.find(line => line.id === row.id);
        if (current && current.amount !== row.amount) updates[row.id] = { amount: row.amount };
      });
      updateLines(updates);
    },
    [toLines, updateLines],
  );

  const equalizeToLines = useCallback(() => {
    if (!(fromTotal > 0) || toSplitRows.length === 0 || !toRowsHaveRates) return;
    applyToAmounts(
      equalizeSplitAmounts(
        formatRoundedAmount(fromTotal, precision),
        toSplitRows,
        precision,
        allocationContext,
      ),
    );
  }, [allocationContext, applyToAmounts, fromTotal, precision, toRowsHaveRates, toSplitRows]);

  const distributeToLines = useCallback(() => {
    if (!(remaining > 0) || toSplitRows.length === 0 || !toRowsHaveRates) return;
    applyToAmounts(
      distributeSplitRemainder(
        formatRoundedAmount(fromTotal, precision),
        toSplitRows,
        precision,
        allocationContext,
      ),
    );
  }, [
    allocationContext,
    applyToAmounts,
    fromTotal,
    precision,
    remaining,
    toRowsHaveRates,
    toSplitRows,
  ]);

  const selectAccount = useCallback(
    (id: string, accountId: AccountId) => {
      const account = accounts.find(candidate => candidate.id === accountId);
      const current = lines.find(line => line.id === id);
      const nextCurrency = account?.currencyCode;
      const currencyChanged = nextCurrency !== current?.accountCurrency;
      updateLine(id, {
        ...lineAccountPatch(accountId, account, account?.accountType ?? AccountType.ASSET),
        ...(currencyChanged ? { exchangeRate: '' } : {}),
      });
    },
    [accounts, lines, updateLine],
  );

  const updateAmount = useCallback(
    (id: string, amount: string) => {
      updateLine(id, { amount });
    },
    [updateLine],
  );

  const updateNotes = useCallback(
    (id: string, notes: string) => {
      updateLine(id, { notes });
    },
    [updateLine],
  );

  const updateConvertedAmount = useCallback(
    (id: string, amount: string) => {
      const line = lines.find(candidate => candidate.id === id);
      if (!line) return;
      const converted = Number.parseFloat(amount);
      const override = withConvertedAmount(
        buildAdvancedRowFx(line, workplaceCurrency).pair,
        converted,
      );
      if (override?.kind !== 'converted') return;
      updateLine(id, { exchangeRate: formatManualBaseRate(override.rates.sourceBaseRate) });
    },
    [lines, updateLine, workplaceCurrency],
  );

  const resetRate = useCallback(
    (id: string) => {
      updateLine(id, { exchangeRate: '' });
      void fetchRatesForLines([id], true);
    },
    [fetchRatesForLines, updateLine],
  );

  const moveLine = useCallback(
    (id: string) => {
      const line = lines.find(candidate => candidate.id === id);
      if (!line) return;
      updateLine(id, {
        transactionType:
          line.transactionType === TransactionType.CREDIT
            ? TransactionType.DEBIT
            : TransactionType.CREDIT,
      });
    },
    [lines, updateLine],
  );

  const removeLine = useCallback(
    (id: string) => {
      const line = lines.find(candidate => candidate.id === id);
      if (!line) return;
      const side = line.transactionType === TransactionType.CREDIT ? fromLines : toLines;
      if (side.length <= 1) return;
      removeEditorLine(id);
    },
    [fromLines, lines, removeEditorLine, toLines],
  );

  return {
    fromLines,
    toLines,
    rowFx,
    accounts: leafAccounts,
    fromTotal,
    toTotal,
    remaining,
    isBalanced,
    canEqualize: fromTotal > 0 && toLines.length > 0 && toRowsHaveRates,
    canDistribute: remaining > 0 && toLines.length > 0 && toRowsHaveRates,
    workplaceCurrency,
    addFromLine: useCallback(() => addLine(TransactionType.CREDIT), [addLine]),
    addToLine: useCallback(() => addLine(TransactionType.DEBIT), [addLine]),
    removeLine,
    canRemoveFrom: fromLines.length > 1,
    canRemoveTo: toLines.length > 1,
    selectAccount,
    updateAmount,
    updateNotes,
    updateConvertedAmount,
    resetRate,
    equalizeToLines,
    distributeToLines,
    moveLine,
  };
}
