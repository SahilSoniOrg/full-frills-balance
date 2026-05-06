import { useUI } from '@/src/contexts/UIContext';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { AccountType } from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';
import { journalRepository } from '@/src/data/repositories/JournalRepository';
import { journalService } from '@/src/features/journal/services/JournalService';
import { transactionService } from '@/src/features/journal/services/TransactionService';
import { useExchangeRate } from '@/src/hooks/useExchangeRate';
import { JournalCalculator } from '@/src/services/accounting/JournalCalculator';
import {
  AccountId,
  AccountRole,
  EMPTY_ACCOUNT_ID,
  JournalEntryLine,
  JournalId,
  TabType,
  TransactionId,
  WorkplaceId,
} from '@/src/types/domain';
import { showErrorAlert } from '@/src/utils/alerts';
import { logger } from '@/src/utils/logger';
import dayjs from 'dayjs';
import { useCallback, useEffect, useMemo, useState } from 'react';

export interface UseJournalEditorOptions {
  journalId?: JournalId;
  initialMode?: 'simple' | 'advanced';
  initialType?: 'expense' | 'income' | 'transfer';
  initialAmount?: string;
  initialDescription?: string;
  initialNotes?: string;
  initialDate?: string; // ISO string format
  initialSourceId?: AccountId;
  initialDestinationId?: AccountId;
  smsId?: string;
  smsRecordId?: string;
  smsSender?: string;
  rawSmsBody?: string;
  /**
   * M-9 fix: callback to run after a successful save. Replaces the previous
   * direct smsService.markSmsAsProcessed call — keeps this hook unaware of
   * SMS concerns and avoids a feature→service boundary violation.
   */
  onAfterSave?: (result: {
    journalId?: JournalId;
    action?: 'created' | 'updated';
  }) => Promise<void>;
  onSuccess?: () => void;
}

/**
 * useJournalEditor - Controller hook for the Journal Entry screen.
 * Consolidates state management and business logic for both simple and advanced modes.
 */
export function useJournalEditor(workplaceId: WorkplaceId, options: UseJournalEditorOptions = {}) {
  const { advancedMode, setAdvancedMode } = useUI();
  const { defaultCurrencyCode: workplaceCurrency } = useWorkplace();
  const {
    journalId,
    initialMode,
    initialType = 'expense',
    initialAmount,
    initialDescription,
    initialNotes,
    initialDate,
    initialSourceId,
    initialDestinationId,
  } = options;
  const { fetchRate } = useExchangeRate();

  /**
   * Initialize mode from explicit prop or user preference
   * - If initialMode is provided: use it (overrides preference)
   * - Otherwise: use the user's saved advancedMode preference
   */
  const [isGuidedMode, setIsGuidedMode] = useState(() => {
    if (initialMode) return initialMode === 'simple';
    return !advancedMode;
  });

  /**
   * Sync user's mode preference when they manually toggle
   *
   * BEHAVIOR:
   * - When user toggles Simple ↔ Advanced, save their preference
   * - Only syncs if no explicit initialMode was provided
   * - initialMode (if present) acts as a one-time override, not a persistent preference
   *
   * This ensures:
   * 1. Deep links can force a specific mode (via initialMode)
   * 2. User's manual toggles are remembered for next time
   * 3. The preference persists across app restarts
   */
  useEffect(() => {
    // Only sync if no explicit initialMode was provided (which overrides preference)
    if (!initialMode) {
      const newAdvancedMode = !isGuidedMode;
      if (newAdvancedMode !== advancedMode) {
        setAdvancedMode(newAdvancedMode);
      }
    }
  }, [isGuidedMode, advancedMode, setAdvancedMode, initialMode]);
  const [transactionType, setTransactionType] = useState<TabType>(initialType);
  const isEdit = !!journalId;

  // Advanced / Generic state
  const [lines, setLines] = useState<JournalEntryLine[]>(() => [
    {
      id: '1' as TransactionId,
      accountId: initialDestinationId || EMPTY_ACCOUNT_ID,
      accountName: '',
      accountType: AccountType.ASSET,
      amount: initialAmount || '',
      transactionType: TransactionType.DEBIT,
      notes: '',
      exchangeRate: '',
    },
    {
      id: '2' as TransactionId,
      accountId: initialSourceId || EMPTY_ACCOUNT_ID,
      accountName: '',
      accountType: AccountType.ASSET,
      amount: initialAmount || '',
      transactionType: TransactionType.CREDIT,
      notes: '',
      exchangeRate: '',
    },
  ]);

  const setGuidedModeInternal = useCallback((mode: boolean) => {
    if (mode) {
      // Normalizing to 2-leg structure if we have more than 2 lines, or if roles are missing
      setLines(current => {
        const debit = current.find(l => l.transactionType === TransactionType.DEBIT) || current[0];
        const credit =
          current.find(l => l.transactionType === TransactionType.CREDIT) || current[1];
        // Rule: Source (Credit) should be the first leg (index 0)
        return [
          { ...credit, id: '1' as TransactionId, transactionType: TransactionType.CREDIT },
          { ...debit, id: '2' as TransactionId, transactionType: TransactionType.DEBIT },
        ];
      });
    }
    setIsGuidedMode(mode);
  }, []);
  const [description, setDescription] = useState(initialDescription || '');
  const [notes, setNotes] = useState(initialNotes || '');
  const [journalDate, setJournalDate] = useState(() =>
    initialDate ? dayjs(initialDate).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
  );
  const [journalTime, setJournalTime] = useState(() =>
    initialDate ? dayjs(initialDate).format('HH:mm') : dayjs().format('HH:mm'),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(isEdit);

  // Load initial data for edit mode
  useEffect(() => {
    if (journalId) {
      const loadData = async () => {
        setIsLoading(true);
        try {
          const journal = await journalRepository.find(workplaceId, journalId);
          if (journal) {
            const dateObj = new Date(journal.journalDate);
            setDescription(journal.description || '');
            setNotes(journal.notes || '');
            setJournalDate(dayjs(dateObj).format('YYYY-MM-DD'));
            setJournalTime(dayjs(dateObj).format('HH:mm'));

            const txs = await transactionService.getEnrichedByJournal(workplaceId, journalId);
            if (txs.length > 0) {
              // 1. Force Advanced Mode for multi-leg transactions
              if (txs.length > 2) {
                setGuidedModeInternal(false);
              }
              // 2. Refined Type Detection for 2-leg transactions
              else if (txs.length === 2) {
                const creditTx = txs.find(t => t.transactionType === TransactionType.CREDIT);
                const debitTx = txs.find(t => t.transactionType === TransactionType.DEBIT);

                if (creditTx && debitTx) {
                  const sourceIsAssetLiab =
                    creditTx.accountType === AccountType.ASSET ||
                    creditTx.accountType === AccountType.LIABILITY;
                  const destIsExpense = debitTx.accountType === AccountType.EXPENSE;

                  const sourceIsIncome = creditTx.accountType === AccountType.INCOME;
                  const destIsAssetLiab =
                    debitTx.accountType === AccountType.ASSET ||
                    debitTx.accountType === AccountType.LIABILITY;

                  if (sourceIsAssetLiab && destIsExpense) {
                    setTransactionType('expense');
                  } else if (sourceIsIncome && destIsAssetLiab) {
                    setTransactionType('income');
                  } else {
                    setTransactionType('transfer');
                  }
                }
              }

              setLines(
                txs.map(tx => ({
                  id: tx.id,
                  accountId: tx.accountId,
                  accountName: tx.accountName || '',
                  accountType: tx.accountType as AccountType,
                  amount: tx.amount.toString(),
                  transactionType: tx.transactionType as TransactionType,
                  notes: tx.notes || '',
                  exchangeRate: tx.exchangeRate ? tx.exchangeRate.toString() : '',
                  accountCurrency: tx.currencyCode,
                })),
              );
            }
          }
        } catch {
          showErrorAlert('Failed to load transaction');
        } finally {
          setIsLoading(false);
        }
      };
      loadData();
    }
  }, [journalId, setGuidedModeInternal, workplaceId]);

  const addLine = useCallback(() => {
    setLines(prev => {
      const ids = prev.map(l => parseInt(l.id)).filter(id => !isNaN(id));
      const nextId = (ids.length > 0 ? Math.max(...ids) + 1 : prev.length + 1).toString();
      return [
        ...prev,
        {
          id: nextId as TransactionId,
          accountId: EMPTY_ACCOUNT_ID,
          accountName: '',
          accountType: AccountType.ASSET,
          amount: '',
          transactionType: TransactionType.DEBIT,
          notes: '',
          exchangeRate: '',
        },
      ];
    });
  }, []);

  const removeLine = useCallback((id: string) => {
    setLines(prev => {
      if (prev.length <= 2) return prev;
      return prev.filter(l => l.id !== id);
    });
  }, []);

  const updateLine = useCallback((id: string, updates: Partial<JournalEntryLine>) => {
    setLines(prev => prev.map(line => (line.id === id ? { ...line, ...updates } : line)));
  }, []);

  const updateLines = useCallback((batch: Record<string, Partial<JournalEntryLine>>) => {
    if (Object.keys(batch).length === 0) return;
    setLines(prev => prev.map(line => (batch[line.id] ? { ...line, ...batch[line.id] } : line)));
  }, []);

  const autoFetchLineRate = useCallback(
    async (id: string) => {
      const line = lines.find(l => l.id === id);
      if (!line || !line.accountCurrency) return;

      try {
        const defaultCurrency = workplaceCurrency;
        if (line.accountCurrency === defaultCurrency) {
          updateLine(id, { exchangeRate: '' });
          return;
        }

        const rate = await fetchRate(line.accountCurrency, defaultCurrency);
        updateLine(id, { exchangeRate: rate.toString() });
      } catch (error) {
        logger.error('Failed to auto-fetch rate for line', { id, error });
        showErrorAlert('Failed to fetch exchange rate');
      }
    },
    [lines, fetchRate, updateLine, workplaceCurrency],
  );

  const balanceLine = useCallback(
    (id: string) => {
      const lineIndex = lines.findIndex(l => l.id === id);
      const line = lines[lineIndex];
      if (!line) return;

      const imbalance = JournalCalculator.calculateImbalance(
        lines.map(l => ({
          amount: l.amount,
          type: l.transactionType,
          exchangeRate: l.exchangeRate,
          accountCurrency: l.accountCurrency,
        })),
        workplaceCurrency,
      );

      if (Math.abs(imbalance) < 0.001) return;

      const currentBase = JournalCalculator.getLineBaseAmount(line, workplaceCurrency);
      const nominal = typeof line.amount === 'string' ? parseFloat(line.amount) : line.amount;

      if (!nominal || nominal === 0) return;

      const targetBase =
        line.transactionType === TransactionType.DEBIT
          ? currentBase - imbalance
          : currentBase + imbalance;

      const newRate = JournalCalculator.calculateImpliedRate(nominal, targetBase);
      const roundedRate = Math.round(newRate * 1000000) / 1000000; // 6 decimal precision for rates

      // Sync to all lines with same currency
      const lineCurrency = line.accountCurrency || workplaceCurrency;
      setLines(prev =>
        prev.map(l => {
          const lCurrency = l.accountCurrency || workplaceCurrency;
          if (lCurrency === lineCurrency && lCurrency !== workplaceCurrency) {
            return { ...l, exchangeRate: roundedRate.toString() };
          }
          return l.id === id ? { ...l, exchangeRate: roundedRate.toString() } : l;
        }),
      );
    },
    [lines, workplaceCurrency],
  );

  const submit = async (overrides?: { description?: string }) => {
    setIsSubmitting(true);
    try {
      // Default description to transaction type if empty
      let finalDescription = overrides?.description || description.trim();
      if (!finalDescription) {
        finalDescription = transactionType.charAt(0).toUpperCase() + transactionType.slice(1);
        setDescription(finalDescription);
      }

      const result = await journalService.saveJournalEntry({
        lines,
        description: finalDescription,
        notes: notes.trim(),
        journalDate,
        journalTime,
        journalId: isEdit ? journalId : undefined,
        mode: isGuidedMode ? 'simple' : 'advanced',
        smsId: options.smsId,
        smsRecordId: options.smsRecordId,
        smsSender: options.smsSender,
        rawSmsBody: options.rawSmsBody,
        workplaceId: workplaceId,
      });

      if (!result.success) {
        showErrorAlert(result.error || 'Unknown error');
        return result;
      }

      await options.onAfterSave?.({ journalId: result.journalId, action: result.action });

      options.onSuccess?.();
      return result;
    } catch {
      showErrorAlert('Unexpected error occurred');
      return { success: false, error: 'Unexpected error occurred' };
    } finally {
      setIsSubmitting(false);
    }
  };

  const getLineIdByRole = (role: AccountRole): string | undefined => {
    // Source is leg 1 (CREDIT), Destination is leg 2 (DEBIT) in guided mode
    const targetType = role === 'source' ? TransactionType.CREDIT : TransactionType.DEBIT;
    return lines.find(l => l.transactionType === targetType)?.id;
  };

  /**
   * Resolves a selection request (role or direct ID) to a line ID.
   * Centralizes guided-mode mapping logic.
   */
  const resolveActiveLineId = (roleOrId: string): string => {
    if (isGuidedMode) {
      return getLineIdByRole(roleOrId as AccountRole) || roleOrId;
    }
    return roleOrId;
  };

  return useMemo(
    () => ({
      isGuidedMode,
      setIsGuidedMode: setGuidedModeInternal,
      transactionType,
      setTransactionType,
      isEdit,
      isLoading,
      lines,
      setLines,
      description,
      setDescription,
      notes,
      setNotes,
      journalDate,
      setJournalDate,
      journalTime,
      setJournalTime,
      isSubmitting,
      addLine,
      removeLine,
      updateLine,
      updateLines,
      balanceLine,
      autoFetchLineRate,
      getLineIdByRole,
      resolveActiveLineId,
      submit,
    }),
    [
      isGuidedMode,
      setGuidedModeInternal,
      transactionType,
      isEdit,
      isLoading,
      lines,
      description,
      notes,
      journalDate,
      journalTime,
      isSubmitting,
      addLine,
      removeLine,
      updateLine,
      updateLines,
      balanceLine,
      autoFetchLineRate,
      getLineIdByRole,
      resolveActiveLineId,
      submit,
      workplaceId,
    ],
  );
}
