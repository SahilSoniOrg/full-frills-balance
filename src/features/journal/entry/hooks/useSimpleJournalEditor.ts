import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import Account from '@/src/data/models/Account';
import {
  AccountType,
  TransactionType,
  AccountId,
  AccountRole,
  EMPTY_ACCOUNT_ID,
  JournalEntryLine,
  TabType,
} from '@/src/types/domain';

import { resolveGuidedAccountsAfterTabChange } from '@/src/services/journal/guidedJournalAccountEligibility';
import { useAccountSelection } from '@/src/features/journal/hooks/useAccountSelection';
import {
  buildSimpleCrossCurrencyLineUpdates,
  buildSimpleDefaultDescription,
  buildSimpleFormAccountSections,
  computeSimpleConvertedAmount,
  parseSimpleAmountInput,
} from '@/src/services/journal/simpleJournalHelpers';
import { getInferredAccountType } from '@/src/utils/accountCategory';
import { pinnedArchivedAccountIds } from '@/src/utils/accountArchive';
import { preferences } from '@/src/utils/preferences';
import { useCallback, useEffect, useMemo } from 'react';
import { useCrossCurrencyRates } from './useCrossCurrencyRates';
import { useJournalEditor } from './useJournalEditor';
import { useSimpleJournalAccountSync } from './useSimpleJournalAccountSync';

export interface UseSimpleJournalEditorProps {
  accounts: Account[];
  editor: ReturnType<typeof useJournalEditor>;
  onSelectAccountRequest: (role: AccountRole) => void;
}

export interface SimpleFormSection {
  title: string;
  accounts: Account[];
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
  // journalNav prefs are global today; workplace scoping is F9.
  const journalNav = preferences.journalNav;

  // Derived State from Editor
  const type = editor.transactionType;
  const isGuidedMode = editor.isGuidedMode;
  const updateLines = editor.updateLines;

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

  const { exchangeRate, sourceBaseRate, destBaseRate, isLoadingRate, rateError } =
    useCrossCurrencyRates({
      sourceCurrency,
      destCurrency,
      workplaceCurrency,
      enabled: isCrossCurrency,
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
      editor.setTransactionType(newType);

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
    [editor, sourceLine, destinationLine, accounts, sourceId, destinationId],
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

  const handleSave = useCallback(async () => {
    if (numAmount <= 0) {
      return;
    }
    if (!sourceId || !destinationId) {
      return;
    }

    let overrides;
    // Default description to type if empty
    if (!editor.description.trim()) {
      const defaultDesc = buildSimpleDefaultDescription(type, sourceAccount, destAccount);
      editor.setDescription(defaultDesc);
      overrides = { description: defaultDesc };
    }

    // Save preferences
    if (type === 'expense' || type === 'transfer') journalNav.setLastUsedSourceAccountId(sourceId);
    if (type === 'income' || type === 'transfer')
      journalNav.setLastUsedDestinationAccountId(destinationId);

    // Use the main editor submit
    await editor.submit(overrides);
  }, [numAmount, sourceId, destinationId, type, editor, destAccount, sourceAccount, journalNav]);

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
      handleSave,
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
      handleSave,
      openAccountPicker,
      numAmount,
      accountSections,
      workplaceCurrency,
    ],
  );
}
