import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import type { AccountFields } from '@/src/types/plainDtos';
import { TransactionType } from '@/src/types/enums';
import { AccountId, EMPTY_ACCOUNT_ID } from '@/src/types/ids';
import { AccountRole, JournalEntryLine, TabType } from '@/src/types/domainJournal';

import { resolveGuidedAccountsAfterTabChange } from '@/src/services/journal/guidedJournalAccountEligibility';
import { lineAccountPatch } from '@/src/services/journal/journalEditorHelpers';
import { useAccountSelection } from '@/src/features/journal/hooks/useAccountSelection';
import {
  fxOverrideKey,
  NO_FX_OVERRIDE,
  resolveFxPair,
  withConvertedAmount,
  withManualBaseRate,
  type FxOverride,
} from '@/src/features/journal/entry/fxPair';
import {
  buildSimpleCrossCurrencyLineUpdates,
  buildSimpleFormAccountSections,
  parseSimpleAmountInput,
  resolveSimpleHeroAmount,
} from '@/src/services/journal/simpleJournalHelpers';
import { getInferredAccountType } from '@/src/utils/accountCategory';
import { pinnedArchivedAccountIds } from '@/src/utils/accountArchive';
import { useCurrencyPrecision } from '@/src/hooks/use-currencies';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCrossCurrencyRates } from './useCrossCurrencyRates';
import { useJournalEditor } from './useJournalEditor';
import { useSimpleJournalAccountSync } from './useSimpleJournalAccountSync';

export interface UseSimpleJournalEditorProps {
  accounts: AccountFields[];
  editor: Pick<
    ReturnType<typeof useJournalEditor>,
    | 'isEdit'
    | 'isGuidedMode'
    | 'transactionType'
    | 'valuationCurrency'
    | 'lines'
    | 'updateLines'
    | 'journalDate'
    | 'setTransactionType'
    | 'setLines'
    | 'updateLine'
    | 'journalTime'
    | 'description'
    | 'isSubmitting'
  >;
  onSelectAccountRequest: (role: AccountRole) => void;
}

export interface SimpleFormSection {
  title: string;
  accounts: AccountFields[];
  selectedId: AccountId;
  onSelect: (id: AccountId) => void;
  role: AccountRole;
}

function sideForRole(role: AccountRole): TransactionType {
  return role === 'source' ? TransactionType.CREDIT : TransactionType.DEBIT;
}

/**
 * useSimpleJournalEditor - Controller hook for the simple journal form.
 * Handles state, basic validation, and exchange rate calculations.
 *
 * REFACTORED: Now uses `editor` as the single source of truth for transaction state.
 */
export function useSimpleJournalEditor({
  accounts,
  editor,
  onSelectAccountRequest,
}: UseSimpleJournalEditorProps) {
  const { defaultCurrencyCode: defaultWorkplaceCurrency } = useWorkplace();
  const valuationCurrency = editor.valuationCurrency || defaultWorkplaceCurrency;
  const hasEditedSimpleDraft = useRef(!editor.isEdit);
  // Derived State from Editor
  const type = editor.transactionType;
  const isGuidedMode = editor.isGuidedMode;
  const updateLines = editor.updateLines;
  const tabDraftsRef = useRef<Partial<Record<TabType, JournalEntryLine[]>>>({
    [type]: editor.lines.map(line => ({ ...line })),
  });
  const previousJournalDateRef = useRef(editor.journalDate);

  const sourceLine = useMemo(
    () => editor.lines.find(l => l.transactionType === TransactionType.CREDIT),
    [editor.lines],
  );
  const destinationLine = useMemo(
    () => editor.lines.find(l => l.transactionType === TransactionType.DEBIT),
    [editor.lines],
  );

  const amount = resolveSimpleHeroAmount(sourceLine?.amount, destinationLine?.amount);
  const sourceId = sourceLine?.accountId || EMPTY_ACCOUNT_ID;
  const destinationId = destinationLine?.accountId || EMPTY_ACCOUNT_ID;
  const sourceLineId = sourceLine?.id;
  const destinationLineId = destinationLine?.id;
  const sourceLineExchangeRate = sourceLine?.exchangeRate ?? '';
  const destinationLineExchangeRate = destinationLine?.exchangeRate ?? '';
  const destinationLineAmount = destinationLine?.amount ?? '';

  const fxKey = fxOverrideKey(sourceId, destinationId, valuationCurrency, editor.journalDate);
  const [fxOverrideState, setFxOverrideState] = useState<{ key: string; override: FxOverride }>({
    key: fxKey,
    override: NO_FX_OVERRIDE,
  });
  const fxOverride = fxOverrideState.key === fxKey ? fxOverrideState.override : NO_FX_OVERRIDE;
  const resetFxOverride = useCallback(
    () => setFxOverrideState({ key: '', override: NO_FX_OVERRIDE }),
    [],
  );
  const [rateRefreshNonce, setRateRefreshNonce] = useState(0);

  const pinnedAccountIds = useMemo(() => {
    const selectedIds = [sourceId, destinationId].filter(
      (id): id is AccountId => !!id && id !== EMPTY_ACCOUNT_ID,
    );
    return pinnedArchivedAccountIds(selectedIds, accounts);
  }, [accounts, sourceId, destinationId]);

  const { transactionAccounts, expenseAccounts, incomeAccounts, leafAccounts } =
    useAccountSelection({
      accounts,
      pinnedAccountIds,
    });

  useSimpleJournalAccountSync({
    accounts,
    editor,
    type,
    sourceId,
    destinationId,
    transactionAccounts,
  });

  const sourceAccount = useMemo(() => accounts.find(a => a.id === sourceId), [accounts, sourceId]);
  const destAccount = useMemo(
    () => accounts.find(a => a.id === destinationId),
    [accounts, destinationId],
  );

  const sourceCurrency = sourceAccount?.currencyCode;
  const destCurrency = destAccount?.currencyCode;
  const { precision: destPrecision } = useCurrencyPrecision(destCurrency);

  const needsValuationRate = !!(
    sourceCurrency &&
    destCurrency &&
    (sourceCurrency !== valuationCurrency || destCurrency !== valuationCurrency)
  );
  const useSavedRates = editor.isEdit && rateRefreshNonce === 0;

  const marketRates = useCrossCurrencyRates({
    sourceCurrency,
    destCurrency,
    workplaceCurrency: valuationCurrency,
    journalDate: editor.journalDate,
    refreshNonce: rateRefreshNonce,
    enabled: needsValuationRate && !useSavedRates,
  });
  const numAmount = useMemo(() => parseSimpleAmountInput(amount), [amount]);

  const fxInput = useMemo(
    () => ({
      sourceCurrency,
      destCurrency,
      baseCurrency: valuationCurrency,
      fetched: useSavedRates ? null : marketRates,
      saved: useSavedRates
        ? { sourceRate: sourceLineExchangeRate, destRate: destinationLineExchangeRate }
        : null,
      sourceAmount: numAmount,
    }),
    [
      destCurrency,
      destinationLineExchangeRate,
      marketRates,
      numAmount,
      sourceCurrency,
      sourceLineExchangeRate,
      useSavedRates,
      valuationCurrency,
    ],
  );
  const fxPair = useMemo(
    () => resolveFxPair({ ...fxInput, override: fxOverride, destPrecision }),
    [destPrecision, fxInput, fxOverride],
  );
  const { isCrossCurrency, pairRate: exchangeRate, sourceBaseRate, destBaseRate } = fxPair;
  const convertedAmount = fxPair.convertedAmount ?? numAmount;

  useEffect(() => {
    if (previousJournalDateRef.current === editor.journalDate) return;
    previousJournalDateRef.current = editor.journalDate;
    hasEditedSimpleDraft.current = true;
  }, [editor.journalDate]);

  // Lines stay the submit/advanced-mode source of truth, so the resolved pair is
  // projected onto them here. Primitive deps + empty-update guard prevent write loops.
  useEffect(() => {
    if (!isGuidedMode || !sourceLineId || !destinationLineId) return;
    if (!hasEditedSimpleDraft.current) return;

    const updates = buildSimpleCrossCurrencyLineUpdates({
      isCrossCurrency,
      exchangeRate,
      sourceBaseRate,
      destBaseRate,
      sourceCurrency,
      destCurrency,
      destPrecision,
      baseCurrency: valuationCurrency,
      amount,
      convertedAmount,
      sourceLine: { id: sourceLineId, exchangeRate: sourceLineExchangeRate, amount },
      destinationLine: {
        id: destinationLineId,
        exchangeRate: destinationLineExchangeRate,
        amount: destinationLineAmount,
      },
    });

    if (Object.keys(updates).length === 0) return;
    updateLines(updates);
  }, [
    isGuidedMode,
    isCrossCurrency,
    exchangeRate,
    sourceBaseRate,
    destBaseRate,
    sourceCurrency,
    destCurrency,
    destPrecision,
    valuationCurrency,
    amount,
    convertedAmount,
    sourceLineId,
    destinationLineId,
    sourceLineExchangeRate,
    destinationLineExchangeRate,
    destinationLineAmount,
    updateLines,
  ]);

  // Helpers to update editor state
  const setType = useCallback(
    (newType: TabType) => {
      if (newType === type) return;
      hasEditedSimpleDraft.current = true;

      // Manual rates are pair-specific input, not part of a saved tab draft.
      resetFxOverride();
      tabDraftsRef.current[type] = editor.lines.map(line => ({ ...line }));
      const savedDraft = tabDraftsRef.current[newType];
      editor.setTransactionType(newType);

      if (savedDraft) {
        editor.setLines(savedDraft.map(line => ({ ...line })));
        return;
      }

      const accountsById = new Map(accounts.map(a => [a.id, a]));
      const { sourceAccountId: nextSourceId, destinationAccountId: nextDestId } =
        resolveGuidedAccountsAfterTabChange(newType, accountsById, sourceId, destinationId);

      const applyAccountToLine = (
        line: JournalEntryLine | undefined,
        accountId: AccountId,
        side: typeof TransactionType.CREDIT | typeof TransactionType.DEBIT,
      ) => {
        if (!line) return;
        editor.updateLine(line.id, {
          transactionType: side,
          ...lineAccountPatch(
            accountId,
            accountsById.get(accountId),
            getInferredAccountType(newType, side),
          ),
        });
      };

      applyAccountToLine(sourceLine, nextSourceId, TransactionType.CREDIT);
      applyAccountToLine(destinationLine, nextDestId, TransactionType.DEBIT);
    },
    [type, editor, sourceLine, destinationLine, accounts, sourceId, destinationId, resetFxOverride],
  );

  const setAmount = useCallback(
    (newAmount: string) => {
      hasEditedSimpleDraft.current = true;
      // Update both lines - the effect will handle the cross-currency conversion
      if (sourceLine) editor.updateLine(sourceLine.id, { amount: newAmount });
      if (destinationLine && !isCrossCurrency)
        editor.updateLine(destinationLine.id, { amount: newAmount });
    },
    [editor, sourceLine, destinationLine, isCrossCurrency],
  );

  const setAccount = useCallback(
    (role: AccountRole, id: AccountId) => {
      hasEditedSimpleDraft.current = true;
      resetFxOverride();
      const side = sideForRole(role);
      const line = editor.lines.find(item => item.transactionType === side);
      if (!line) return;
      const nextAccount = accounts.find(account => account.id === id);
      const currencyChanged =
        role === 'destination' &&
        Boolean(destCurrency) &&
        nextAccount?.currencyCode !== destCurrency;
      if (currencyChanged) setRateRefreshNonce(nonce => nonce + 1);
      editor.updateLine(line.id, {
        ...lineAccountPatch(id, nextAccount, getInferredAccountType(type, side)),
        ...(currencyChanged ? { exchangeRate: '' } : {}),
      });
    },
    [accounts, destCurrency, editor, resetFxOverride, type],
  );
  const setSourceId = useCallback((id: AccountId) => setAccount('source', id), [setAccount]);
  const setDestinationId = useCallback(
    (id: AccountId) => setAccount('destination', id),
    [setAccount],
  );

  const swapAccounts = useCallback(() => {
    if (type !== 'transfer') return;
    hasEditedSimpleDraft.current = true;

    const currentSourceLine = editor.lines.find(
      line => line.transactionType === TransactionType.CREDIT,
    );
    const currentDestinationLine = editor.lines.find(
      line => line.transactionType === TransactionType.DEBIT,
    );
    if (!currentSourceLine || !currentDestinationLine) return;

    const patchFor = (accountId: AccountId, side: TransactionType) =>
      lineAccountPatch(
        accountId,
        accounts.find(item => item.id === accountId),
        getInferredAccountType(type, side),
      );

    updateLines({
      [currentSourceLine.id]: patchFor(currentDestinationLine.accountId, TransactionType.CREDIT),
      [currentDestinationLine.id]: patchFor(currentSourceLine.accountId, TransactionType.DEBIT),
    });
    resetFxOverride();
  }, [accounts, editor.lines, resetFxOverride, type, updateLines]);

  const setManualBaseRate = useCallback(
    (role: 'source' | 'destination', value: string) => {
      hasEditedSimpleDraft.current = true;
      setFxOverrideState(previous => {
        const current = previous.key === fxKey ? previous.override : NO_FX_OVERRIDE;
        const pair = resolveFxPair({ ...fxInput, override: current });
        return { key: fxKey, override: withManualBaseRate(pair, role, value) };
      });
    },
    [fxInput, fxKey],
  );

  const setConvertedAmount = useCallback(
    (value: string) => {
      const override = withConvertedAmount(fxPair, parseSimpleAmountInput(value));
      if (!override) return;
      hasEditedSimpleDraft.current = true;
      setFxOverrideState({ key: fxKey, override });
    },
    [fxKey, fxPair],
  );

  const resetToApiRate = useCallback(() => {
    hasEditedSimpleDraft.current = true;
    resetFxOverride();
    setRateRefreshNonce(nonce => nonce + 1);
  }, [resetFxOverride]);

  const accountSections = useMemo((): SimpleFormSection[] => {
    return buildSimpleFormAccountSections(type, {
      leafAccounts,
      accountPool: accounts,
      sourceId,
      destinationId,
    }).map(section => ({
      ...section,
      onSelect: section.role === 'source' ? setSourceId : setDestinationId,
    }));
  }, [type, leafAccounts, accounts, sourceId, destinationId, setSourceId, setDestinationId]);

  const openAccountPicker = useCallback(
    (role: AccountRole) => {
      onSelectAccountRequest(role);
    },
    [onSelectAccountRequest],
  );

  return useMemo(
    () => ({
      type,
      setType,
      amount,
      setAmount,
      sourceId,
      setSourceId,
      destinationId,
      setDestinationId,
      swapAccounts,
      // Passthrough props for UI compatibility
      journalDate: editor.journalDate,
      journalTime: editor.journalTime,
      description: editor.description,

      isSubmitting: editor.isSubmitting,
      fxPair,
      exchangeRate,
      manualSourceBaseRate: fxPair.manualSourceBaseRate,
      manualDestBaseRate: fxPair.manualDestBaseRate,
      showManualRateFields: fxPair.needsManualRates,
      needsWorkplaceRate: needsValuationRate,
      setManualBaseRate,
      setConvertedAmount,
      resetToApiRate,
      isLoadingRate: fxPair.isLoading,
      rateError: fxPair.rateError,
      isCrossCurrency,
      convertedAmount,
      transactionAccounts,
      expenseAccounts,
      incomeAccounts,
      allAccounts: accounts,
      sourceCurrency,
      destCurrency,
      displayCurrency: sourceCurrency || destCurrency || valuationCurrency,
      openAccountPicker,
      isValidAmount: numAmount > 0,
      accountSections,
    }),
    [
      type,
      setType,
      amount,
      setAmount,
      sourceId,
      setSourceId,
      destinationId,
      setDestinationId,
      swapAccounts,
      editor.journalDate,
      editor.journalTime,
      editor.description,
      editor.isSubmitting,
      fxPair,
      exchangeRate,
      needsValuationRate,
      setManualBaseRate,
      setConvertedAmount,
      resetToApiRate,
      isCrossCurrency,
      convertedAmount,
      transactionAccounts,
      expenseAccounts,
      incomeAccounts,
      accounts,
      sourceCurrency,
      destCurrency,
      openAccountPicker,
      numAmount,
      accountSections,
      valuationCurrency,
    ],
  );
}
