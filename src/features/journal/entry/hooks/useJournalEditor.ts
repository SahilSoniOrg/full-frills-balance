import { useAdvancedModePrefs } from '@/src/hooks/useAdvancedModePrefs';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { TransactionType } from '@/src/data/models/Transaction';
import { useJournalActions } from '@/src/features/journal/hooks/useJournalActions';
import {
  JournalEditorHydration,
  useJournalEditorLoader,
} from '@/src/features/journal/entry/hooks/useJournalEditorLoader';
import { deriveJournalEditorBalanceState } from '@/src/features/journal/entry/journalEditorBalancePolicy';
import { normalizeJournalLinesForGuidedMode } from '@/src/services/journal/journalEditorHelpers';
import {
  AccountId,
  AccountRole,
  JournalEntryLine,
  JournalId,
  TabType,
  WorkplaceId,
} from '@/src/types/domain';
import { showErrorAlert } from '@/src/utils/alerts';
import dayjs from 'dayjs';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useJournalEditorExchangeRates } from './useJournalEditorExchangeRates';
import { useJournalEditorLineState } from './useJournalEditorLineState';

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
  const { saveJournalEntry } = useJournalActions(workplaceId);
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
  const { lines, setLines, addLine, removeLine, updateLine, updateLines, balanceLine } =
    useJournalEditorLineState({
      initialAmount,
      initialSourceId,
      initialDestinationId,
      workplaceCurrency,
    });

  const setGuidedModeInternal = useCallback(
    (mode: boolean) => {
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
    },
    [setLines],
  );
  const [description, setDescription] = useState(initialDescription || '');
  const [notes, setNotes] = useState(initialNotes || '');
  const [journalDate, setJournalDate] = useState(() =>
    initialDate ? dayjs(initialDate).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
  );
  const [journalTime, setJournalTime] = useState(() =>
    initialDate ? dayjs(initialDate).format('HH:mm') : dayjs().format('HH:mm'),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const hydrateEditor = useCallback(
    (snapshot: JournalEditorHydration) => {
      setDescription(snapshot.description);
      setNotes(snapshot.notes);
      setJournalDate(snapshot.journalDate);
      setJournalTime(snapshot.journalTime);
      if (snapshot.transactionType) setTransactionType(snapshot.transactionType);
      if (snapshot.lines) setLines(snapshot.lines);
      if (snapshot.isGuidedMode !== undefined) setGuidedModeInternal(snapshot.isGuidedMode);
    },
    [
      setDescription,
      setGuidedModeInternal,
      setJournalDate,
      setJournalTime,
      setLines,
      setNotes,
      setTransactionType,
    ],
  );
  const isLoading = useJournalEditorLoader({
    workplaceId,
    journalId,
    hydrateEditor,
  });

  const { fetchRatesForLines } = useJournalEditorExchangeRates({
    lines,
    workplaceCurrency,
    isLoading,
    isSubmitting,
    updateLines,
  });

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

        const result = await saveJournalEntry({
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
      smsId,
      smsRecordId,
      smsSender,
      rawSmsBody,
      onAfterSave,
      onSuccess,
      setLines,
      saveJournalEntry,
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
      setLines,
    ],
  );
}
