import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import Account, { AccountType } from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';
import { useAccountSelection } from '@/src/features/journal/hooks/useAccountSelection';
import { useExchangeRate } from '@/src/hooks/useExchangeRate';
import {
  buildSimpleCrossCurrencyLineUpdates,
  buildSimpleDefaultDescription,
  buildSimpleFormAccountSections,
  computeSimpleConvertedAmount,
  parseSimpleAmountInput,
  resolveSimpleCrossCurrencyRates,
  shouldApplyLastUsedAccountDefault,
} from '@/src/services/journal/simpleJournalHelpers';
import {
  AccountId,
  AccountRole,
  EMPTY_ACCOUNT_ID,
  JournalEntryLine,
  TabType,
} from '@/src/types/domain';
import { getInferredAccountType } from '@/src/utils/accountCategory';
import { logger } from '@/src/utils/logger';
import { preferences } from '@/src/utils/preferences';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useJournalEditor } from './useJournalEditor';

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
  const { fetchRate } = useExchangeRate();

  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [sourceBaseRate, setSourceBaseRate] = useState<number | null>(null);
  const [destBaseRate, setDestBaseRate] = useState<number | null>(null);
  const [isLoadingRate, setIsLoadingRate] = useState(false);
  const [rateError, setRateError] = useState<string | null>(null);

  // Derived State from Editor
  const type = editor.transactionType;

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

  // Use shared account selection logic for filtering
  const { transactionAccounts, expenseAccounts, incomeAccounts, leafAccounts } =
    useAccountSelection({
      accounts,
    });

  const sourceAccount = useMemo(() => accounts.find(a => a.id === sourceId), [accounts, sourceId]);
  const destAccount = useMemo(
    () => accounts.find(a => a.id === destinationId),
    [accounts, destinationId],
  );

  const sourceCurrency = useMemo(() => sourceAccount?.currencyCode, [sourceAccount]);
  const destCurrency = useMemo(() => destAccount?.currencyCode, [destAccount]);

  const isCrossCurrency = !!(sourceCurrency && destCurrency && sourceCurrency !== destCurrency);

  // Rate calculations
  useEffect(() => {
    const fetchCurrentRate = async () => {
      if (!isCrossCurrency || !sourceCurrency || !destCurrency) {
        setExchangeRate(null);
        setSourceBaseRate(null);
        setDestBaseRate(null);
        return;
      }

      setIsLoadingRate(true);
      setRateError(null);
      try {
        // To ensure balance in base currency, we fetch both rates relative to workplace currency
        const [fetchedSourceToWorkplace, fetchedDestToWorkplace] = await Promise.all([
          sourceCurrency !== workplaceCurrency ? fetchRate(sourceCurrency, workplaceCurrency) : 1.0,
          destCurrency !== workplaceCurrency ? fetchRate(destCurrency, workplaceCurrency) : 1.0,
        ]);

        const resolved = resolveSimpleCrossCurrencyRates({
          sourceCurrency,
          destCurrency,
          workplaceCurrency,
          fetchedSourceToWorkplace,
          fetchedDestToWorkplace,
        });
        setSourceBaseRate(resolved.sourceBaseRate);
        setDestBaseRate(resolved.destBaseRate);
        setExchangeRate(resolved.exchangeRate);
      } catch (error) {
        setRateError('Rate unavailable');
        logger.error('Failed to fetch rate', { sourceCurrency, destCurrency, error });
      } finally {
        setIsLoadingRate(false);
      }
    };

    fetchCurrentRate();
  }, [isCrossCurrency, sourceCurrency, destCurrency, fetchRate, workplaceCurrency]);

  const numAmount = useMemo(() => parseSimpleAmountInput(amount), [amount]);

  const convertedAmount = useMemo(
    () => computeSimpleConvertedAmount(numAmount, isCrossCurrency, exchangeRate),
    [numAmount, isCrossCurrency, exchangeRate],
  );

  // Sync exchange rate and converted amounts back to lines for Advanced mode consistency
  useEffect(() => {
    if (!editor.isGuidedMode || !sourceLine || !destinationLine) return;

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
      sourceLine,
      destinationLine,
    });

    if (Object.keys(updates).length > 0) {
      editor.updateLines(updates);
    }
  }, [
    exchangeRate,
    sourceBaseRate,
    destBaseRate,
    isCrossCurrency,
    sourceLine,
    destinationLine,
    convertedAmount,
    amount,
    editor,
    sourceCurrency,
    destCurrency,
    numAmount,
    workplaceCurrency,
  ]);

  // Helpers to update editor state
  const setType = useCallback(
    (newType: TabType) => {
      editor.setTransactionType(newType);

      // Simple mode always assumes 2 lines. Let's ensure they have the correct roles.
      // Expense: Source (Credit: Asset/Liab) -> Dest (Debit: Expense)
      // Income: Source (Credit: Income) -> Dest (Debit: Asset/Liab)
      // Transfer: Source (Credit: Asset/Liab) -> Dest (Debit: Asset/Liab)

      if (sourceLine) {
        editor.updateLine(sourceLine.id, {
          transactionType: TransactionType.CREDIT,
          accountId: EMPTY_ACCOUNT_ID,
          accountName: '',
          accountType: getInferredAccountType(newType, TransactionType.CREDIT),
          accountCurrency: undefined,
        });
      }
      if (destinationLine) {
        editor.updateLine(destinationLine.id, {
          transactionType: TransactionType.DEBIT,
          accountId: EMPTY_ACCOUNT_ID,
          accountName: '',
          accountType: getInferredAccountType(newType, TransactionType.DEBIT),
          accountCurrency: undefined,
        });
      }
    },
    [editor, sourceLine, destinationLine],
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
      const account = accounts.find(a => a.id === id);
      if (sourceLine) {
        editor.updateLine(sourceLine.id, {
          accountId: id,
          accountName: account?.name || '',
          accountType: account?.accountType || AccountType.ASSET,
          accountCurrency: account?.currencyCode,
        });
      }
    },
    [accounts, sourceLine, editor],
  );

  const setDestinationId = useCallback(
    (id: AccountId) => {
      const account = accounts.find(a => a.id === id);
      if (destinationLine) {
        editor.updateLine(destinationLine.id, {
          accountId: id,
          accountName: account?.name || '',
          accountType: account?.accountType || AccountType.ASSET,
          accountCurrency: account?.currencyCode,
        });
      }
    },
    [accounts, destinationLine, editor],
  );

  // Account defaulting logic (re-implemented to work with editor state)
  useEffect(() => {
    if (!editor.isGuidedMode || editor.isEdit) return;

    const lastSourceId = preferences.journalNav.lastUsedSourceAccountId;
    const lastDestId = preferences.journalNav.lastUsedDestinationAccountId;

    let shouldUpdate = false;
    let newSourceId: AccountId | undefined;
    let newDestId: AccountId | undefined;

    if (
      shouldApplyLastUsedAccountDefault(type, 'source', sourceId) &&
      lastSourceId &&
      transactionAccounts.some(a => a.id === lastSourceId)
    ) {
      newSourceId = lastSourceId;
      shouldUpdate = true;
    }

    if (
      shouldApplyLastUsedAccountDefault(type, 'destination', destinationId) &&
      lastDestId &&
      transactionAccounts.some(a => a.id === lastDestId)
    ) {
      newDestId = lastDestId;
      shouldUpdate = true;
    }

    if (shouldUpdate) {
      editor.setLines(prev => {
        return prev.map(line => {
          if (line.transactionType === TransactionType.CREDIT && newSourceId) {
            const account = accounts.find(a => a.id === newSourceId);
            return {
              ...line,
              accountId: newSourceId,
              accountName: account?.name || '',
              accountType: account?.accountType || AccountType.ASSET,
              accountCurrency: account?.currencyCode,
            };
          }
          if (line.transactionType === TransactionType.DEBIT && newDestId) {
            const account = accounts.find(a => a.id === newDestId);
            return {
              ...line,
              accountId: newDestId,
              accountName: account?.name || '',
              accountType: account?.accountType || AccountType.ASSET,
              accountCurrency: account?.currencyCode,
            };
          }
          return line;
        });
      });
    }
  }, [type, transactionAccounts, destinationId, sourceId, accounts, editor]); // Run when type changes or accounts load

  // Hydrate account details into lines if they were initialized just with accountId (like from deep link or params)
  useEffect(() => {
    if (accounts.length === 0) return;

    const updates: Record<string, Partial<JournalEntryLine>> = {};
    editor.lines.forEach(line => {
      if (line.accountId && !line.accountName) {
        const acct = accounts.find(a => a.id === line.accountId);
        if (acct) {
          updates[line.id] = {
            accountName: acct.name,
            accountType: acct.accountType,
            accountCurrency: acct.currencyCode,
          };
        }
      }
    });

    if (Object.keys(updates).length > 0) {
      editor.updateLines(updates);
    }
  }, [accounts, editor.lines, editor]);

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
    if (type === 'expense' || type === 'transfer')
      await preferences.journalNav.setLastUsedSourceAccountId(sourceId);
    if (type === 'income' || type === 'transfer')
      await preferences.journalNav.setLastUsedDestinationAccountId(destinationId);

    // Use the main editor submit
    await editor.submit(overrides);
  }, [numAmount, sourceId, destinationId, type, editor, destAccount, sourceAccount]);

  const accountSections = useMemo((): SimpleFormSection[] => {
    return buildSimpleFormAccountSections(type, {
      expenseAccounts,
      incomeAccounts,
      transactionAccounts,
      leafAccounts,
      sourceId,
      destinationId,
    }).map(section => ({
      ...section,
      onSelect: section.role === 'source' ? setSourceId : setDestinationId,
    }));
  }, [
    type,
    expenseAccounts,
    incomeAccounts,
    transactionAccounts,
    leafAccounts,
    sourceId,
    destinationId,
    setSourceId,
    setDestinationId,
  ]);

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
