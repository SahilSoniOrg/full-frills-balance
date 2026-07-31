import { useAdvancedModePrefs } from '@/src/hooks/useAdvancedModePrefs';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { AccountType } from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';
import { journalService } from '@/src/services/journal/journalDomainService';
import { useJournalEditorLoader } from '@/src/features/journal/entry/hooks/useJournalEditorLoader';
import { deriveJournalEditorBalanceState } from '@/src/features/journal/entry/journalEditorBalancePolicy';
import { normalizeJournalLinesForGuidedMode } from '@/src/services/journal/journalEditorHelpers';
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
import { logger } from '@/src/utils/logger';
import { showErrorAlert } from '@/src/utils/alerts';
import dayjs from 'dayjs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
  const { advancedMode, setAdvancedMode } = useAdvancedModePrefs();
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
    smsId,
    smsRecordId,
    smsSender,
    rawSmsBody,
    onAfterSave,
    onSuccess,
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
    if (!mode) {
      setIsGuidedMode(false);
      return;
    }

    setLines(current => {
      const normalized = normalizeJournalLinesForGuidedMode(current);
      if (normalized.forceAdvancedMode) {
        setIsGuidedMode(false);
        return current;
      }
      setIsGuidedMode(true);
      return normalized.lines;
    });
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
  const isLoading = useJournalEditorLoader({
    workplaceId,
    journalId,
    setDescription,
    setNotes,
    setJournalDate,
    setJournalTime,
    setTransactionType,
    setLines,
    setGuidedMode: setGuidedModeInternal,
  });

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

  const fetchRatesForLines = useCallback(
    async (ids: string[], forceRefresh: boolean = false) => {
      const pendingLines = lines.filter(l => ids.includes(l.id) && l.accountCurrency);
      if (pendingLines.length === 0) return;

      try {
        const defaultCurrency = workplaceCurrency;
        const updates: Record<string, Partial<JournalEntryLine>> = {};

        await Promise.all(
          pendingLines.map(async line => {
            const currency = line.accountCurrency;
            if (!currency) return;

            if (currency === defaultCurrency) {
              updates[line.id] = { exchangeRate: '' };
            } else {
              const rate = await fetchRate(currency, defaultCurrency, forceRefresh);
              updates[line.id] = { exchangeRate: rate.toString() };
            }
          }),
        );

        updateLines(updates);
      } catch (error) {
        logger.error('Failed to auto-fetch rates for lines', { ids, error });
        showErrorAlert('Failed to fetch exchange rates');
      }
    },
    [lines, fetchRate, updateLines, workplaceCurrency],
  );

  const autoFetchedLines = useRef<Set<string>>(new Set());

  // Auto-fetch rates when currency changes or line is added
  useEffect(() => {
    const idsToFetch: string[] = [];

    lines.forEach(line => {
      if (
        line.accountCurrency &&
        line.accountCurrency !== workplaceCurrency &&
        !line.exchangeRate &&
        !isLoading &&
        !isSubmitting
      ) {
        const cacheKey = `${line.id}_${line.accountCurrency}`;
        if (!autoFetchedLines.current.has(cacheKey)) {
          autoFetchedLines.current.add(cacheKey);
          idsToFetch.push(line.id);
        }
      }
    });

    if (idsToFetch.length > 0) {
      fetchRatesForLines(idsToFetch);
    }
  }, [lines, workplaceCurrency, fetchRatesForLines, isLoading, isSubmitting]);

  const balanceLine = useCallback(
    (id: string) => {
      setLines(prev => {
        const corrected = JournalCalculator.applyImbalanceRateCorrectionToLines(
          prev,
          id,
          workplaceCurrency,
        );
        return corrected ?? prev;
      });
    },
    [workplaceCurrency],
  );

  const submit = useCallback(
    async (overrides?: { description?: string; lines?: JournalEntryLine[] }) => {
      setIsSubmitting(true);
      try {
        // Default description to transaction type if empty
        let finalDescription = overrides?.description || description.trim();
        if (!finalDescription) {
          finalDescription = transactionType.charAt(0).toUpperCase() + transactionType.slice(1);
          setDescription(finalDescription);
        }

        const linesToSave = overrides?.lines ?? lines;
        if (overrides?.lines) {
          setLines(overrides.lines);
        }

        const result = await journalService.saveJournalEntry({
          lines: linesToSave,
          description: finalDescription,
          notes: notes.trim(),
          journalDate,
          journalTime,
          journalId: isEdit ? journalId : undefined,
          mode: isGuidedMode ? 'simple' : 'advanced',
          smsId,
          smsRecordId,
          smsSender,
          rawSmsBody,
          workplaceId: workplaceId,
        });

        if (!result.success) {
          showErrorAlert(result.error || 'Unknown error');
          return result;
        }

        await onAfterSave?.({ journalId: result.journalId, action: result.action });

        onSuccess?.();
        return result;
      } catch {
        showErrorAlert('Unexpected error occurred');
        return { success: false, error: 'Unexpected error occurred' };
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      description,
      transactionType,
      lines,
      notes,
      journalDate,
      journalTime,
      isEdit,
      journalId,
      isGuidedMode,
      workplaceId,
      smsId,
      smsRecordId,
      smsSender,
      rawSmsBody,
      onAfterSave,
      onSuccess,
    ],
  );

  const getLineIdByRole = useCallback(
    (role: AccountRole): string | undefined => {
      // Source is leg 1 (CREDIT), Destination is leg 2 (DEBIT) in guided mode
      const targetType = role === 'source' ? TransactionType.CREDIT : TransactionType.DEBIT;
      return lines.find(l => l.transactionType === targetType)?.id;
    },
    [lines],
  );

  /**
   * Resolves a selection request (role or direct ID) to a line ID.
   * Centralizes guided-mode mapping logic.
   */
  const resolveActiveLineId = useCallback(
    (roleOrId: string): string => {
      if (isGuidedMode) {
        if (roleOrId === 'source' || roleOrId === 'destination') {
          return getLineIdByRole(roleOrId as AccountRole) || roleOrId;
        }
        return roleOrId;
      }
      return roleOrId;
    },
    [isGuidedMode, getLineIdByRole],
  );

  const { imbalance, isUnbalanced, isEntryReadyToBalance } = useMemo(
    () => deriveJournalEditorBalanceState(lines, workplaceCurrency),
    [lines, workplaceCurrency],
  );

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
      fetchRatesForLines,
      getLineIdByRole,
      resolveActiveLineId,
      submit,
      imbalance,
      isUnbalanced,
      isEntryReadyToBalance,
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
      fetchRatesForLines,
      getLineIdByRole,
      resolveActiveLineId,
      submit,
      imbalance,
      isUnbalanced,
      isEntryReadyToBalance,
    ],
  );
}
