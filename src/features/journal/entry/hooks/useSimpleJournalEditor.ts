import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import type { AccountFields } from '@/src/types/plainDtos';
import { AccountType, TransactionType } from '@/src/types/enums';
import { AccountId, EMPTY_ACCOUNT_ID } from '@/src/types/ids';
import { AccountRole, JournalEntryLine, TabType } from '@/src/types/domainJournal';

import { resolveGuidedAccountsAfterTabChange } from '@/src/services/journal/guidedJournalAccountEligibility';
import { useAccountSelection } from '@/src/features/journal/hooks/useAccountSelection';
import {
  buildSimpleCrossCurrencyLineUpdates,
  buildSimpleFormAccountSections,
  computeSimpleConvertedAmount,
  parseSimpleAmountInput,
} from '@/src/services/journal/simpleJournalHelpers';
import { getInferredAccountType } from '@/src/utils/accountCategory';
import { pinnedArchivedAccountIds } from '@/src/utils/accountArchive';
import { logger } from '@/src/utils/logger';
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
  const { defaultCurrencyCode: workplaceCurrency } = useWorkplace();
  // Derived State from Editor
  const type = editor.transactionType;
  const isGuidedMode = editor.isGuidedMode;
  const updateLines = editor.updateLines;
  const tabDraftsRef = useRef<Partial<Record<TabType, JournalEntryLine[]>>>({
    [type]: editor.lines.map(line => ({ ...line })),
  });

  const sourceLine = useMemo(
    () => editor.lines.find(l => l.transactionType === TransactionType.CREDIT),
    [editor.lines],
  );
  const destinationLine = useMemo(
    () => editor.lines.find(l => l.transactionType === TransactionType.DEBIT),
    [editor.lines],
  );

  const amount = sourceLine?.amount || destinationLine?.amount || '';
  const sourceId = sourceLine?.accountId || EMPTY_ACCOUNT_ID;
  const destinationId = destinationLine?.accountId || EMPTY_ACCOUNT_ID;
  const sourceLineId = sourceLine?.id;
  const destinationLineId = destinationLine?.id;
  const sourceLineExchangeRate = sourceLine?.exchangeRate ?? '';
  const destinationLineExchangeRate = destinationLine?.exchangeRate ?? '';
  const destinationLineAmount = destinationLine?.amount ?? '';
  const [manualSourceBaseRate, setManualSourceBaseRate] = useState('');
  const [manualDestBaseRate, setManualDestBaseRate] = useState('');

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
  const needsWorkplaceRate = !!(
    sourceCurrency &&
    destCurrency &&
    (sourceCurrency !== workplaceCurrency || destCurrency !== workplaceCurrency)
  );

  const { exchangeRate, sourceBaseRate, destBaseRate, isLoadingRate, rateError } =
    useCrossCurrencyRates({
      sourceCurrency,
      destCurrency,
      workplaceCurrency,
      manualSourceBaseRate,
      manualDestBaseRate,
      journalDate: editor.journalDate,
      enabled: needsWorkplaceRate,
    });

  const numAmount = useMemo(() => parseSimpleAmountInput(amount), [amount]);

  const convertedAmount = useMemo(
    () => computeSimpleConvertedAmount(numAmount, isCrossCurrency, exchangeRate),
    [numAmount, isCrossCurrency, exchangeRate],
  );

  // Sync exchange rate and converted amounts back to lines for Advanced mode consistency.
  // Primitive deps + empty-update guard prevent child→parent write loops.
  useEffect(() => {
    if (!isGuidedMode || !sourceLineId || !destinationLineId) return;

    const updates = buildSimpleCrossCurrencyLineUpdates({
      isCrossCurrency,
      exchangeRate,
      sourceBaseRate,
      destBaseRate,
      sourceCurrency,
      destCurrency,
      baseCurrency: workplaceCurrency,
      amount,
      convertedAmount,
      sourceLine: { id: sourceLineId, exchangeRate: sourceLineExchangeRate, amount },
      destinationLine: {
        id: destinationLineId,
        exchangeRate: destinationLineExchangeRate,
        amount: destinationLineAmount,
      },
    });

    logger.debug('[DEBUG-FX-SAVE] simple line sync', {
      sourceCurrency,
      destCurrency,
      workplaceCurrency,
      amount,
      exchangeRate,
      sourceBaseRate,
      destBaseRate,
      sourceLine: {
        id: sourceLineId,
        amount,
        exchangeRate: sourceLineExchangeRate,
      },
      destinationLine: {
        id: destinationLineId,
        amount: destinationLineAmount,
        exchangeRate: destinationLineExchangeRate,
      },
      updates,
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
    workplaceCurrency,
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

      // Manual rates are pair-specific input, not part of a saved tab draft.
      setManualSourceBaseRate('');
      setManualDestBaseRate('');
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
      // Update both lines - the effect will handle the cross-currency conversion
      if (sourceLine) editor.updateLine(sourceLine.id, { amount: newAmount });
      if (destinationLine && !isCrossCurrency)
        editor.updateLine(destinationLine.id, { amount: newAmount });
    },
    [editor, sourceLine, destinationLine, isCrossCurrency],
  );

  const setSourceId = useCallback(
    (id: AccountId) => {
      setManualSourceBaseRate('');
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
      setManualDestBaseRate('');
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

  const setManualBaseRate = useCallback(
    (role: 'source' | 'destination', value: string) => {
      if (role === 'source') setManualSourceBaseRate(value);
      else setManualDestBaseRate(value);
      const line = editor.lines.find(item =>
        role === 'source'
          ? item.transactionType === TransactionType.CREDIT
          : item.transactionType === TransactionType.DEBIT,
      );
      if (line) editor.updateLine(line.id, { exchangeRate: value });
    },
    [editor],
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
      // Passthrough props for UI compatibility
      journalDate: editor.journalDate,
      journalTime: editor.journalTime,
      description: editor.description,

      isSubmitting: editor.isSubmitting,
      exchangeRate,
      sourceExchangeRate: sourceLineExchangeRate,
      destinationExchangeRate: destinationLineExchangeRate,
      setManualBaseRate,
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
      displayCurrency: sourceCurrency || destCurrency || workplaceCurrency,
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
      editor.journalDate,
      editor.journalTime,
      editor.description,
      editor.isSubmitting,
      exchangeRate,
      sourceLineExchangeRate,
      destinationLineExchangeRate,
      setManualBaseRate,
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
      workplaceCurrency,
    ],
  );
}
