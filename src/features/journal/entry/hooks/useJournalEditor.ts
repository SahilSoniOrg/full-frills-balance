import { useAdvancedModePrefs } from '@/src/hooks/useAdvancedModePrefs';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { TransactionType } from '@/src/types/enums';
import { AccountId, JournalId, WorkplaceId } from '@/src/types/ids';
import { AccountRole, TabType } from '@/src/types/domainJournal';

import { useJournalActions } from '@/src/features/journal/hooks/useJournalActions';
import {
  JournalEditorHydration,
  JournalEditorLoadState,
  useJournalEditorLoader,
} from '@/src/features/journal/entry/hooks/useJournalEditorLoader';
import { normalizeJournalLinesForGuidedMode } from '@/src/services/journal/journalEditorHelpers';
import dayjs from 'dayjs';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useJournalEditorExchangeRates } from './useJournalEditorExchangeRates';
import { useJournalEditorLineState } from './useJournalEditorLineState';
import { useJournalEditorSubmission } from './useJournalEditorSubmission';

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
  /** Callback to run after a successful save. */
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
  const { postPostingPlan } = useJournalActions(workplaceId);
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
  const [savedJournalCurrency, setSavedJournalCurrency] = useState<string>();
  const valuationCurrency = isEdit ? savedJournalCurrency || workplaceCurrency : workplaceCurrency;

  // Advanced / Generic state
  const { lines, setLines, addLine, removeLine, updateLine, updateLines } =
    useJournalEditorLineState({
      initialAmount,
      initialSourceId,
      initialDestinationId,
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
  const hydrateEditor = useCallback(
    (snapshot: JournalEditorHydration) => {
      setSavedJournalCurrency(snapshot.journalCurrency);
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
  const loadState: JournalEditorLoadState = useJournalEditorLoader({
    workplaceId,
    journalId,
    hydrateEditor,
  });
  const isLoading = loadState === 'loading';

  const { isSubmitting, submitPlan } = useJournalEditorSubmission({
    postPostingPlan,
    journalId: isEdit ? journalId : undefined,
    smsId,
    smsRecordId,
    smsSender,
    rawSmsBody,
    onAfterSave,
    onSuccess,
  });

  const { fetchRatesForLines, rateFetchStates } = useJournalEditorExchangeRates({
    lines,
    valuationCurrency,
    journalDate,
    isLoading,
    isExistingJournal: isEdit,
    journalId,
    isSubmitting,
    updateLines,
  });

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

  return useMemo(
    () => ({
      isGuidedMode,
      setIsGuidedMode: setGuidedModeInternal,
      transactionType,
      setTransactionType,
      isEdit,
      valuationCurrency,
      isLoading,
      loadState,
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
      fetchRatesForLines,
      rateFetchStates,
      getLineIdByRole,
      resolveActiveLineId,
      submitPlan,
    }),
    [
      isGuidedMode,
      setGuidedModeInternal,
      transactionType,
      isEdit,
      valuationCurrency,
      isLoading,
      loadState,
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
      fetchRatesForLines,
      rateFetchStates,
      getLineIdByRole,
      resolveActiveLineId,
      submitPlan,
      setLines,
    ],
  );
}
