import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import type { AccountFields } from '@/src/types/plainDtos';
import { AccountType, TransactionType } from '@/src/types/enums';
import { AccountId, EMPTY_ACCOUNT_ID } from '@/src/types/ids';
import { AccountRole, JournalEntryLine, TabType } from '@/src/types/domainJournal';

import { resolveGuidedAccountsAfterTabChange } from '@/src/services/journal/guidedJournalAccountEligibility';
import { useAccountSelection } from '@/src/features/journal/hooks/useAccountSelection';
import {
  formatManualBaseRate,
  resolveWorkplaceRatesFromConvertedAmount,
} from '@/src/features/journal/entry/manualBaseRate';
import {
  buildSimpleCrossCurrencyLineUpdates,
  buildSimpleFormAccountSections,
  computeSimpleConvertedAmount,
  parseSimpleAmountInput,
  resolveSimpleHeroAmount,
} from '@/src/services/journal/simpleJournalHelpers';
import { getInferredAccountType } from '@/src/utils/accountCategory';
import { pinnedArchivedAccountIds } from '@/src/utils/accountArchive';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCrossCurrencyRates } from './useCrossCurrencyRates';
import { useJournalEditor } from './useJournalEditor';
import { useSimpleJournalAccountSync } from './useSimpleJournalAccountSync';

export interface UseSimpleJournalEditorProps {
  accounts: AccountFields[];
  editor: ReturnType<typeof useJournalEditor>;
  onSelectAccountRequest: (role: AccountRole) => void;
}

export interface SimpleFormSection {
  title: string;
  accounts: AccountFields[];
  selectedId: AccountId;
  onSelect: (id: AccountId) => void;
  role: AccountRole;
}

function parsePositiveRate(value: string | number | undefined): number | null {
  const rate = Number(value);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
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
  const [manualSourceBaseRate, setManualSourceBaseRate] = useState('');
  const [manualDestBaseRate, setManualDestBaseRate] = useState('');
  const [convertedAmountLocked, setConvertedAmountLocked] = useState(false);
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

  const isCrossCurrency = !!(sourceCurrency && destCurrency && sourceCurrency !== destCurrency);
  const needsValuationRate = !!(
    sourceCurrency &&
    destCurrency &&
    (sourceCurrency !== valuationCurrency || destCurrency !== valuationCurrency)
  );

  const marketRates = useCrossCurrencyRates({
    sourceCurrency,
    destCurrency,
    workplaceCurrency: valuationCurrency,
    manualSourceBaseRate,
    manualDestBaseRate,
    journalDate: editor.journalDate,
    refreshNonce: rateRefreshNonce,
    enabled: needsValuationRate && (!editor.isEdit || rateRefreshNonce > 0),
  });
  const savedSourceRate = parsePositiveRate(sourceLineExchangeRate);
  const savedDestinationRate = parsePositiveRate(destinationLineExchangeRate);
  const savedSourceBaseRate =
    sourceCurrency === valuationCurrency
      ? 1
      : sourceCurrency === destCurrency
        ? (savedSourceRate ?? savedDestinationRate)
        : savedSourceRate;
  const savedDestBaseRate =
    destCurrency === valuationCurrency
      ? 1
      : sourceCurrency === destCurrency
        ? savedSourceBaseRate
        : savedDestinationRate;
  const useSavedRates = editor.isEdit && rateRefreshNonce === 0;
  const sourceBaseRate = useSavedRates ? savedSourceBaseRate : marketRates.sourceBaseRate;
  const destBaseRate = useSavedRates ? savedDestBaseRate : marketRates.destBaseRate;
  const exchangeRate = useSavedRates
    ? sourceBaseRate && destBaseRate
      ? sourceBaseRate / destBaseRate
      : null
    : marketRates.exchangeRate;
  const isLoadingRate = useSavedRates ? false : marketRates.isLoadingRate;
  const rateError = marketRates.rateError;

  useEffect(() => {
    if (previousJournalDateRef.current === editor.journalDate) return;
    previousJournalDateRef.current = editor.journalDate;
    hasEditedSimpleDraft.current = true;
    setConvertedAmountLocked(false);
    setManualSourceBaseRate('');
    setManualDestBaseRate('');
  }, [editor.journalDate]);

  const numAmount = useMemo(() => parseSimpleAmountInput(amount), [amount]);

  const convertedAmount = useMemo(
    () => computeSimpleConvertedAmount(numAmount, isCrossCurrency, exchangeRate),
    [numAmount, isCrossCurrency, exchangeRate],
  );

  // Sync exchange rate and converted amounts back to lines for Advanced mode consistency.
  // Primitive deps + empty-update guard prevent child→parent write loops.
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
      setManualSourceBaseRate('');
      setManualDestBaseRate('');
      setConvertedAmountLocked(false);
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
        if (!accountId || accountId === EMPTY_ACCOUNT_ID) {
          editor.updateLine(line.id, {
            transactionType: side,
            accountId: EMPTY_ACCOUNT_ID,
            accountName: '',
            accountType: getInferredAccountType(newType, side),
            accountCurrency: undefined,
          });
          return;
        }
        const account = accountsById.get(accountId);
        editor.updateLine(line.id, {
          transactionType: side,
          accountId,
          accountName: account?.name || '',
          accountType: account?.accountType || getInferredAccountType(newType, side),
          accountCurrency: account?.currencyCode,
        });
      };

      applyAccountToLine(sourceLine, nextSourceId, TransactionType.CREDIT);
      applyAccountToLine(destinationLine, nextDestId, TransactionType.DEBIT);
    },
    [type, editor, sourceLine, destinationLine, accounts, sourceId, destinationId],
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

  const setSourceId = useCallback(
    (id: AccountId) => {
      hasEditedSimpleDraft.current = true;
      setManualSourceBaseRate('');
      setManualDestBaseRate('');
      setConvertedAmountLocked(false);
      const line = editor.lines.find(item => item.transactionType === TransactionType.CREDIT);
      if (!line) return;
      if (!id || id === EMPTY_ACCOUNT_ID) {
        editor.updateLine(line.id, {
          accountId: EMPTY_ACCOUNT_ID,
          accountName: '',
          accountType: getInferredAccountType(type, TransactionType.CREDIT),
          accountCurrency: undefined,
        });
        return;
      }
      const account = accounts.find(a => a.id === id);
      editor.updateLine(line.id, {
        accountId: id,
        accountName: account?.name || '',
        accountType: account?.accountType || AccountType.ASSET,
        accountCurrency: account?.currencyCode,
      });
    },
    [accounts, editor, type],
  );

  const setDestinationId = useCallback(
    (id: AccountId) => {
      hasEditedSimpleDraft.current = true;
      setManualSourceBaseRate('');
      setManualDestBaseRate('');
      setConvertedAmountLocked(false);
      const line = editor.lines.find(item => item.transactionType === TransactionType.DEBIT);
      if (!line) return;
      if (!id || id === EMPTY_ACCOUNT_ID) {
        editor.updateLine(line.id, {
          accountId: EMPTY_ACCOUNT_ID,
          accountName: '',
          accountType: getInferredAccountType(type, TransactionType.DEBIT),
          accountCurrency: undefined,
        });
        return;
      }
      const account = accounts.find(a => a.id === id);
      editor.updateLine(line.id, {
        accountId: id,
        accountName: account?.name || '',
        accountType: account?.accountType || AccountType.ASSET,
        accountCurrency: account?.currencyCode,
      });
    },
    [accounts, editor, type],
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

    const getAccountUpdates = (accountId: AccountId, side: TransactionType) => {
      if (!accountId || accountId === EMPTY_ACCOUNT_ID) {
        return {
          accountId: EMPTY_ACCOUNT_ID,
          accountName: '',
          accountType: getInferredAccountType(type, side),
          accountCurrency: undefined,
        };
      }

      const account = accounts.find(item => item.id === accountId);
      return {
        accountId,
        accountName: account?.name || '',
        accountType: account?.accountType || AccountType.ASSET,
        accountCurrency: account?.currencyCode,
      };
    };

    updateLines({
      [currentSourceLine.id]: getAccountUpdates(
        currentDestinationLine.accountId,
        TransactionType.CREDIT,
      ),
      [currentDestinationLine.id]: getAccountUpdates(
        currentSourceLine.accountId,
        TransactionType.DEBIT,
      ),
    });
    setManualSourceBaseRate('');
    setManualDestBaseRate('');
    setConvertedAmountLocked(false);
  }, [accounts, editor.lines, type, updateLines]);

  const setManualBaseRate = useCallback((role: 'source' | 'destination', value: string) => {
    hasEditedSimpleDraft.current = true;
    setConvertedAmountLocked(false);
    if (role === 'source') setManualSourceBaseRate(value);
    else setManualDestBaseRate(value);
  }, []);

  const setConvertedAmount = useCallback(
    (value: string) => {
      if (!sourceCurrency || !destCurrency) return;
      hasEditedSimpleDraft.current = true;
      const parsedConverted = parseSimpleAmountInput(value);
      const rates = resolveWorkplaceRatesFromConvertedAmount({
        sourceAmount: numAmount,
        convertedAmount: parsedConverted,
        sourceCurrency,
        destCurrency,
        workplaceCurrency: valuationCurrency,
        existingSourceBaseRate: sourceBaseRate,
        existingDestBaseRate: destBaseRate,
      });
      if (!rates) return;

      setConvertedAmountLocked(true);
      setManualSourceBaseRate(
        sourceCurrency === valuationCurrency ? '' : formatManualBaseRate(rates.sourceBaseRate),
      );
      setManualDestBaseRate(
        destCurrency === valuationCurrency || destCurrency === sourceCurrency
          ? ''
          : formatManualBaseRate(rates.destBaseRate),
      );
    },
    [destBaseRate, destCurrency, numAmount, sourceBaseRate, sourceCurrency, valuationCurrency],
  );

  const resetToApiRate = useCallback(() => {
    hasEditedSimpleDraft.current = true;
    setConvertedAmountLocked(false);
    setManualSourceBaseRate('');
    setManualDestBaseRate('');
    setRateRefreshNonce(nonce => nonce + 1);
  }, []);

  const showManualRateFields = Boolean(
    rateError ||
    (!convertedAmountLocked && (manualSourceBaseRate.trim() || manualDestBaseRate.trim())),
  );

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
      exchangeRate,
      manualSourceBaseRate,
      manualDestBaseRate,
      showManualRateFields,
      needsWorkplaceRate: needsValuationRate,
      setManualBaseRate,
      setConvertedAmount,
      resetToApiRate,
      isLoadingRate,
      rateError,
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
      exchangeRate,
      manualSourceBaseRate,
      manualDestBaseRate,
      showManualRateFields,
      needsValuationRate,
      setManualBaseRate,
      setConvertedAmount,
      resetToApiRate,
      isLoadingRate,
      rateError,
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
