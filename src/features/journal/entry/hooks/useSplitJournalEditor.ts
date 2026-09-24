import type { AccountFields } from '@/src/types/plainDtos';
import { useAccountSelection } from '@/src/features/journal/hooks/useAccountSelection';
import {
  SplitJournalController,
  type SplitRowFx,
} from '@/src/features/journal/entry/modes/split/splitJournalState';
import {
  amountInSourceCurrency,
  getSplitCurrencyPrecision,
  rowAmountFromBase,
  type SplitRowState,
} from '@/src/services/journal/splitJournalHelpers';
import {
  selectSplitDraftLines,
  useSplitDraftProjection,
} from '@/src/features/journal/entry/modes/split/splitDraftProjection';
import {
  resolveFxPair,
  withConvertedAmount,
  type FxPairInput,
} from '@/src/features/journal/entry/fxPair';
import { formatManualBaseRate } from '@/src/features/journal/entry/manualBaseRate';
import {
  currencyPairKey,
  useCrossCurrencyRatesMap,
} from '@/src/features/journal/entry/hooks/useCrossCurrencyRates';
import { lineAccountPatch, parsePositiveRate } from '@/src/services/journal/journalEditorHelpers';
import { parseSimpleAmountInput } from '@/src/services/journal/simpleJournalHelpers';
import { AccountId, EMPTY_ACCOUNT_ID } from '@/src/types/ids';
import { JournalEntryLine, TabType } from '@/src/types/domainJournal';
import { TransactionType } from '@/src/types/enums';
import { pinnedArchivedAccountIds } from '@/src/utils/accountArchive';
import { formatRoundedAmount } from '@/src/utils/money';
import {
  filterGuidedLegAccounts,
  isAccountAllowedOnGuidedLeg,
} from '@/src/services/journal/guidedJournalAccountEligibility';
import { getInferredAccountType } from '@/src/utils/accountCategory';
import { preferences } from '@/src/services/preferences';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
    | 'setLines'
    | 'addLine'
    | 'transactionType'
    | 'setTransactionType'
    | 'journalDate'
  >;
}

type LineUpdates = Record<string, Partial<JournalEntryLine>>;

type SourceAmounts = ReadonlyMap<string, string>;

const NO_SOURCE_AMOUNTS: SourceAmounts = new Map();

function withSourceAmounts(amounts: SourceAmounts, changes: Record<string, string | null>) {
  const entries = Object.entries(changes);
  if (entries.every(([id, amount]) => (amounts.get(id) ?? null) === amount)) return amounts;
  const next = new Map(amounts);
  entries.forEach(([id, amount]) => (amount === null ? next.delete(id) : next.set(id, amount)));
  return next;
}

function withoutUnchanged(updates: LineUpdates, lines: JournalEntryLine[]): LineUpdates {
  return Object.fromEntries(
    Object.entries(updates).filter(([id, patch]) => {
      const line = lines.find(candidate => candidate.id === id);
      return (
        !line ||
        Object.entries(patch).some(([key, value]) => line[key as keyof JournalEntryLine] !== value)
      );
    }),
  );
}

function normalizeCurrency(currency: string | undefined): string | undefined {
  return currency?.trim().toUpperCase() || undefined;
}

export function useSplitJournalEditor({
  accounts,
  workplaceCurrency,
  editor,
}: UseSplitJournalEditorProps): SplitJournalController {
  const initializedRef = useRef(false);
  const [rateRefreshNonce, setRateRefreshNonce] = useState(0);
  /**
   * Row id -> line amount written in the source currency while awaiting a rate. The entry
   * only applies while the line still holds that amount. Rows in a foreign non-workplace
   * currency without a line rate are also read as source-currency amounts.
   */
  const [sourceAmounts, setSourceAmounts] = useState(NO_SOURCE_AMOUNTS);

  const { setIsGuidedMode, isEdit, isSubmitting, updateLine, updateLines } = editor;

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

  const addSplitRow = editor.addLine;
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
      setSourceAmounts(amounts =>
        withSourceAmounts(amounts, Object.fromEntries(Object.keys(updates).map(id => [id, null]))),
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
  const fallbackRowCurrency = normalizeCurrency(displayCurrency) ?? 'USD';
  const rowCurrency = useCallback(
    (split: SplitRowState) => normalizeCurrency(split.accountCurrency) ?? fallbackRowCurrency,
    [fallbackRowCurrency],
  );

  const fxPairs = useMemo(
    () =>
      splits
        .map(split => ({ sourceCurrency, destCurrency: rowCurrency(split) }))
        .filter(pair => pair.sourceCurrency && pair.sourceCurrency !== pair.destCurrency),
    [rowCurrency, sourceCurrency, splits],
  );
  const fxRates = useCrossCurrencyRatesMap({
    pairs: fxPairs,
    workplaceCurrency,
    journalDate: editor.journalDate,
    refreshNonce: rateRefreshNonce,
    enabled: !isEdit || rateRefreshNonce > 0,
  });

  const { splitFx, pendingIds } = useMemo(() => {
    const byId: Record<string, SplitRowFx> = {};
    const pending = new Set<string>();
    const sourcePrecision = getSplitCurrencyPrecision(sourceCurrency, precision);
    splits.forEach(split => {
      const destCurrency = rowCurrency(split);
      const rowPrecision = split.precision ?? precision;
      const input: FxPairInput = {
        sourceCurrency,
        destCurrency,
        baseCurrency: workplaceCurrency,
        fetched: fxRates[currencyPairKey(sourceCurrency, destCurrency)] ?? null,
        saved: { sourceRate: currencyContext.sourceExchangeRate, destRate: split.exchangeRate },
      };
      const { isCrossCurrency, pairRate } = resolveFxPair(input);
      const isPending =
        isCrossCurrency &&
        (sourceAmounts.get(split.id) === split.amount ||
          (destCurrency !== workplaceCurrency && !parsePositiveRate(split.exchangeRate)));
      if (isPending) pending.add(split.id);

      const nominalAmount = Number.parseFloat(split.amount);
      const inputAmount =
        isCrossCurrency && !isPending && pairRate && Number.isFinite(nominalAmount)
          ? amountInSourceCurrency(nominalAmount, pairRate, sourcePrecision)
          : split.amount;
      byId[split.id] = {
        pair: resolveFxPair({ ...input, sourceAmount: Number.parseFloat(inputAmount) || 0 }),
        inputAmount,
        inputCurrency: isCrossCurrency && sourceCurrency ? sourceCurrency : destCurrency,
        inputPrecision: isCrossCurrency ? sourcePrecision : rowPrecision,
        rowPrecision,
      };
    });
    return { splitFx: byId, pendingIds: pending };
  }, [
    currencyContext.sourceExchangeRate,
    fxRates,
    precision,
    rowCurrency,
    sourceAmounts,
    sourceCurrency,
    splits,
    workplaceCurrency,
  ]);

  const fxLineUpdates = useCallback(
    (
      id: string,
      fx: SplitRowFx,
      amount: number,
      sourceBaseRate: number | null,
      destBaseRate: number | null,
    ): LineUpdates => {
      const updates: LineUpdates = {
        [id]: {
          amount: formatRoundedAmount(amount, fx.rowPrecision),
          exchangeRate:
            fx.pair.destCurrency === workplaceCurrency || !destBaseRate
              ? ''
              : formatManualBaseRate(destBaseRate),
        },
      };
      if (sourceLine && fx.pair.sourceCurrency !== workplaceCurrency && sourceBaseRate) {
        updates[sourceLine.id] = { exchangeRate: formatManualBaseRate(sourceBaseRate) };
      }
      return updates;
    },
    [sourceLine, workplaceCurrency],
  );

  useEffect(() => {
    const updates: LineUpdates = {};
    let marketSourceRate: number | null = null;
    for (const split of splits) {
      const fx = splitFx[split.id];
      const { pairRate, sourceBaseRate, destBaseRate, isCrossCurrency } = fx.pair;
      if (!isCrossCurrency) continue;
      marketSourceRate ??= sourceBaseRate;
      if (!pendingIds.has(split.id) || !pairRate || !destBaseRate) continue;
      const base = Number.parseFloat(split.amount);
      if (!(base > 0)) continue;
      Object.assign(
        updates,
        fxLineUpdates(
          split.id,
          fx,
          rowAmountFromBase(base, pairRate, fx.rowPrecision),
          sourceBaseRate,
          destBaseRate,
        ),
      );
    }
    if (
      sourceLine &&
      !updates[sourceLine.id] &&
      sourceCurrency !== workplaceCurrency &&
      !parsePositiveRate(sourceLine.exchangeRate) &&
      marketSourceRate
    ) {
      updates[sourceLine.id] = { exchangeRate: formatManualBaseRate(marketSourceRate) };
    }
    const changed = withoutUnchanged(updates, editor.lines);
    if (Object.keys(changed).length > 0) updateLines(changed);
  }, [
    editor.lines,
    fxLineUpdates,
    pendingIds,
    sourceCurrency,
    sourceLine,
    splitFx,
    splits,
    updateLines,
    workplaceCurrency,
  ]);

  const updateSplitRow = useCallback(
    (id: string, patch: Partial<Pick<SplitRowState, 'accountId' | 'amount' | 'exchangeRate'>>) => {
      if (patch.accountId !== undefined) {
        const account = accounts.find(candidate => candidate.id === patch.accountId);
        const nextCurrency = normalizeCurrency(account?.currencyCode);
        const becomesCross = Boolean(
          sourceCurrency && nextCurrency && nextCurrency !== sourceCurrency,
        );
        const lineAmount = destinationLines.find(candidate => candidate.id === id)?.amount;
        const sourceAmount = splitFx[id]?.inputAmount ?? lineAmount ?? '';
        setSourceAmounts(amounts =>
          withSourceAmounts(amounts, { [id]: becomesCross ? sourceAmount : null }),
        );
        updateLine(id, {
          ...patch,
          ...(sourceAmount !== lineAmount ? { amount: sourceAmount } : {}),
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
    [accounts, destinationLines, sourceCurrency, splitFx, transactionType, updateLine],
  );

  const updateSplitInputAmount = useCallback(
    (id: string, amount: string) => {
      const fx = splitFx[id];
      if (!fx?.pair.isCrossCurrency) {
        updateLine(id, { amount });
        return;
      }

      const base = Number.parseFloat(amount);
      const { pairRate, sourceBaseRate, destBaseRate } = fx.pair;
      if (!(base > 0) || !pairRate || !destBaseRate) {
        setSourceAmounts(amounts => withSourceAmounts(amounts, { [id]: amount }));
        updateLine(id, { amount });
        return;
      }

      setSourceAmounts(amounts => withSourceAmounts(amounts, { [id]: null }));
      updateLines(
        fxLineUpdates(
          id,
          fx,
          rowAmountFromBase(base, pairRate, fx.rowPrecision),
          sourceBaseRate,
          destBaseRate,
        ),
      );
    },
    [fxLineUpdates, splitFx, updateLine, updateLines],
  );

  const updateSplitConvertedAmount = useCallback(
    (id: string, amount: string) => {
      const fx = splitFx[id];
      if (!fx?.pair.isCrossCurrency) return;
      const convertedAmount = Number.parseFloat(amount);
      const override = withConvertedAmount(fx.pair, convertedAmount);
      if (override?.kind !== 'converted') return;

      setSourceAmounts(amounts => withSourceAmounts(amounts, { [id]: null }));
      updateLines(
        fxLineUpdates(
          id,
          fx,
          convertedAmount,
          override.rates.sourceBaseRate,
          override.rates.destBaseRate,
        ),
      );
    },
    [fxLineUpdates, splitFx, updateLines],
  );

  const resetSplitRate = useCallback(
    (id: string) => {
      const fx = splitFx[id];
      if (!fx) return;
      const updates: LineUpdates = { [id]: { amount: fx.inputAmount, exchangeRate: '' } };
      if (sourceLine && fx.pair.sourceCurrency !== workplaceCurrency) {
        updates[sourceLine.id] = { exchangeRate: '' };
      }
      setSourceAmounts(amounts => withSourceAmounts(amounts, { [id]: fx.inputAmount }));
      updateLines(updates);
      setRateRefreshNonce(nonce => nonce + 1);
    },
    [sourceLine, splitFx, updateLines, workplaceCurrency],
  );

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
      addSplitRow,
      removeSplitRow,
      updateSplitRow,
      updateSplitAmounts,
      updateSplitInputAmount,
      updateSplitConvertedAmount,
      resetSplitRate,
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
      addSplitRow,
      removeSplitRow,
      updateSplitRow,
      updateSplitAmounts,
      updateSplitInputAmount,
      updateSplitConvertedAmount,
      resetSplitRate,
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
