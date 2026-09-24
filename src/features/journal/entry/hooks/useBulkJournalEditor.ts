import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import dayjs from 'dayjs';
import { generator as generateId } from '@/src/data/database/idGenerator';
import { useExchangeRate } from '@/src/hooks/useExchangeRate';
import { AccountId, EMPTY_ACCOUNT_ID } from '@/src/types/ids';
import { MAX_BULK_JOURNAL_ROWS } from '@/src/constants';
import { useJournalActions } from '@/src/features/journal/hooks/useJournalActions';
import {
  NO_FX_OVERRIDE,
  resolveFxPair,
  withConvertedAmount,
  withManualBaseRate,
  type FxFetchedRates,
  type FxPair,
} from '@/src/features/journal/entry/fxPair';
import { fetchPairRates } from '@/src/features/journal/entry/hooks/useCrossCurrencyRates';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { sanitizeAmount } from '@/src/utils/validation';
import { logger } from '@/src/utils/logger';
import { analytics } from '@/src/services/analytics';
import { triggerSaveOutcomeHaptic } from '@/src/utils/haptics';
import type { AccountFields } from '@/src/types/plainDtos';
import type { JournalAutofillSuggestion } from '@/src/data/repositories/journal/journalEnrichmentTypes';
import { resolveGuidedAccountsAfterTabChange } from '@/src/services/journal/guidedJournalAccountEligibility';
import {
  DUPLICATE_ACCOUNT_ERROR,
  buildBulkJournalEntries,
  getBulkJournalDuplicateAccountError,
  isBulkJournalRowEmpty,
  validateBulkJournalRow,
} from './bulkJournalHelpers';
import {
  isSimpleTargetAccountUnset,
  resolveTargetAccountIdForSimpleTab,
} from '@/src/services/journal/simpleJournalHelpers';
import type {
  BulkJournalRow,
  BulkJournalRowActions,
  UseBulkJournalEditorProps,
} from '../types/bulkJournal';

const generateRowId = () => generateId();
const BULK_VALIDATION_DEBOUNCE_MS = 1000;
const LOADING_RATES: FxFetchedRates = {
  sourceBaseRate: null,
  destBaseRate: null,
  isLoading: true,
  error: null,
};

function reconcileVisibleValidation(
  previousRow: BulkJournalRow,
  nextRow: BulkJournalRow,
): BulkJournalRow {
  const duplicateAccountError = getBulkJournalDuplicateAccountError(
    nextRow.sourceId,
    nextRow.destinationId,
  );
  if (duplicateAccountError) return { ...nextRow, validationError: duplicateAccountError };

  // Account distinctness is the only validation that should react immediately
  // to an account picker change. Full-row validation is debounced below.
  if (
    previousRow.validationError === DUPLICATE_ACCOUNT_ERROR &&
    previousRow.sourceId === nextRow.sourceId &&
    previousRow.destinationId === nextRow.destinationId
  ) {
    return { ...nextRow, validationError: DUPLICATE_ACCOUNT_ERROR };
  }

  return { ...nextRow, validationError: undefined };
}

function rowJournalDay(journalDate: number): string {
  return dayjs(journalDate).format('YYYY-MM-DD');
}

/** FX pair for one bulk row, resolved from the row's accounts, fetched rates, and override. */
export function resolveBulkRowFxPair(
  row: BulkJournalRow,
  accounts: AccountFields[],
  workplaceCurrency: string,
): FxPair {
  const destCurrency = accounts.find(account => account.id === row.destinationId)?.currencyCode;
  return resolveFxPair({
    sourceCurrency: accounts.find(account => account.id === row.sourceId)?.currencyCode,
    destCurrency,
    baseCurrency: workplaceCurrency,
    fetched: row.fxRates ?? null,
    override: row.fxOverride,
    sourceAmount: sanitizeAmount(row.amount) || 0,
    destPrecision: CurrencyFormatter.getPrecisionFallback(destCurrency),
  });
}

function projectRowFx(row: BulkJournalRow, pair: FxPair): BulkJournalRow {
  if (!pair.isCrossCurrency) {
    return {
      ...row,
      fxRates: null,
      fxOverride: NO_FX_OVERRIDE,
      exchangeRate: '',
      sourceBaseRate: undefined,
      destBaseRate: undefined,
      sourceBaseRateInput: '',
      destBaseRateInput: '',
      isCrossCurrency: false,
      convertedAmount: 0,
      isLoadingRate: false,
      rateError: undefined,
    };
  }
  return {
    ...row,
    exchangeRate: pair.pairRate ? pair.pairRate.toFixed(6) : '',
    sourceBaseRate: pair.sourceBaseRate ?? undefined,
    destBaseRate: pair.destBaseRate ?? undefined,
    sourceBaseRateInput: pair.manualSourceBaseRate,
    destBaseRateInput: pair.manualDestBaseRate,
    isCrossCurrency: true,
    convertedAmount: pair.convertedAmount === null ? 0 : sanitizeAmount(pair.convertedAmount) || 0,
    isLoadingRate: pair.isLoading,
    rateError: pair.rateError ?? undefined,
  };
}

export function useBulkJournalEditor({
  workplaceId,
  workplaceCurrency,
  accounts,
  onSaveSuccess,
}: UseBulkJournalEditorProps) {
  const { fetchRequiredRate, fetchHistoricalRate } = useExchangeRate();
  const { saveBulkJournalEntries } = useJournalActions(workplaceId);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submissionInFlightRef = useRef(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Initialize with one empty row
  const createRow = useCallback((prevRow?: BulkJournalRow): BulkJournalRow => {
    if (prevRow) {
      return {
        id: generateRowId(),
        description: prevRow.description,
        notes: prevRow.notes,
        transactionType: prevRow.transactionType,
        amount: prevRow.amount,
        sourceId: prevRow.sourceId,
        destinationId: prevRow.destinationId,
        journalDate: prevRow.journalDate,
        exchangeRate: prevRow.exchangeRate,
        sourceBaseRate: prevRow.sourceBaseRate,
        destBaseRate: prevRow.destBaseRate,
        sourceBaseRateInput: prevRow.sourceBaseRateInput,
        destBaseRateInput: prevRow.destBaseRateInput,
        isCrossCurrency: prevRow.isCrossCurrency,
        convertedAmount: prevRow.convertedAmount,
        isLoadingRate: false,
        validationError: undefined,
        rateError: undefined,
        fxRates: prevRow.fxRates,
        fxOverride: prevRow.fxOverride,
      };
    }
    return {
      id: generateRowId(),
      description: '',
      notes: '',
      transactionType: 'transfer',
      amount: '',
      sourceId: EMPTY_ACCOUNT_ID,
      destinationId: EMPTY_ACCOUNT_ID,
      journalDate: Date.now(),
      exchangeRate: '',
      isCrossCurrency: false,
      convertedAmount: 0,
      isLoadingRate: false,
      validationError: undefined,
      rateError: undefined,
    };
  }, []);

  const [rows, setRows] = useState<BulkJournalRow[]>(() => [createRow()]);

  // Maintain a synchronous ref for immediate reads/writes inside callbacks to prevent race conditions during rapid updates
  const latestRowsRef = useRef(rows);
  const validationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rateRequestSeqRef = useRef(new Map<string, number>());

  const clearValidationTimer = useCallback(() => {
    if (validationTimerRef.current) {
      clearTimeout(validationTimerRef.current);
      validationTimerRef.current = null;
    }
  }, []);

  const scheduleValidation = useCallback(() => {
    clearValidationTimer();
    validationTimerRef.current = setTimeout(() => {
      validationTimerRef.current = null;
      const validatedRows = latestRowsRef.current.map(row => ({
        ...row,
        validationError: isBulkJournalRowEmpty(row) ? undefined : validateBulkJournalRow(row),
      }));
      latestRowsRef.current = validatedRows;
      setRows(validatedRows);
    }, BULK_VALIDATION_DEBOUNCE_MS);
  }, [clearValidationTimer]);

  useEffect(() => clearValidationTimer, [clearValidationTimer]);

  useEffect(() => {
    latestRowsRef.current = rows;
  }, [rows]);

  const commitRows = useCallback(
    (nextRows: BulkJournalRow[], shouldScheduleValidation = true) => {
      latestRowsRef.current = nextRows;
      setRows(nextRows);
      if (shouldScheduleValidation) scheduleValidation();
    },
    [scheduleValidation],
  );

  const updateRow = useCallback(
    (rowId: string, update: (row: BulkJournalRow) => BulkJournalRow) => {
      const nextRows = latestRowsRef.current.map(row => (row.id === rowId ? update(row) : row));
      commitRows(nextRows);
      return nextRows.find(row => row.id === rowId);
    },
    [commitRows],
  );

  /** The only path that writes a row's projected FX fields. */
  const applyRates = useCallback(
    (row: BulkJournalRow, rates: FxFetchedRates | null = row.fxRates ?? null) => {
      const nextRow = { ...row, fxRates: rates };
      return reconcileVisibleValidation(
        row,
        projectRowFx(nextRow, resolveBulkRowFxPair(nextRow, accounts, workplaceCurrency)),
      );
    },
    [accounts, workplaceCurrency],
  );

  const refreshRates = useCallback(
    (rowId: string) => {
      const row = latestRowsRef.current.find(item => item.id === rowId);
      if (!row) return;
      const requestSeq = (rateRequestSeqRef.current.get(rowId) ?? 0) + 1;
      rateRequestSeqRef.current.set(rowId, requestSeq);

      const { sourceCurrency, destCurrency, isCrossCurrency } = resolveBulkRowFxPair(
        row,
        accounts,
        workplaceCurrency,
      );
      updateRow(rowId, current => applyRates(current, isCrossCurrency ? LOADING_RATES : null));
      if (!isCrossCurrency) return;

      void fetchPairRates(
        {
          sourceCurrency,
          destCurrency,
          baseCurrency: workplaceCurrency,
          journalDate: rowJournalDay(row.journalDate),
        },
        { fetchRequiredRate, fetchHistoricalRate },
      ).then(rates => {
        if (rateRequestSeqRef.current.get(rowId) !== requestSeq) return;
        updateRow(rowId, current => applyRates(current, rates));
      });
    },
    [accounts, applyRates, fetchHistoricalRate, fetchRequiredRate, updateRow, workplaceCurrency],
  );

  const addRow = useCallback(() => {
    if (latestRowsRef.current.length >= MAX_BULK_JOURNAL_ROWS) return;
    const lastRow = latestRowsRef.current[latestRowsRef.current.length - 1];
    const nextRow = createRow(lastRow);
    commitRows([...latestRowsRef.current, nextRow]);
    if (nextRow.fxRates?.isLoading) refreshRates(nextRow.id);
  }, [commitRows, createRow, refreshRates]);

  const removeRow = useCallback(
    (id: string) => {
      const filtered = latestRowsRef.current.filter(r => r.id !== id);
      const nextRows = filtered.length > 0 ? filtered : [createRow()];
      commitRows(nextRows);
    },
    [commitRows, createRow],
  );

  const clearRows = useCallback(() => {
    clearValidationTimer();
    const nextRows = [createRow()];
    latestRowsRef.current = nextRows;
    setRows(nextRows);
    setSubmitError(null);
  }, [clearValidationTimer, createRow]);

  const setDescription = useCallback(
    (rowId: string, value: string) => {
      updateRow(rowId, row => reconcileVisibleValidation(row, { ...row, description: value }));
    },
    [updateRow],
  );

  const setNotes = useCallback(
    (rowId: string, value: string) => {
      updateRow(rowId, row => reconcileVisibleValidation(row, { ...row, notes: value }));
    },
    [updateRow],
  );

  const setAmount = useCallback(
    (rowId: string, value: string) => {
      updateRow(rowId, row => applyRates({ ...row, amount: value }));
    },
    [applyRates, updateRow],
  );

  const updateAndRefreshRates = useCallback(
    (rowId: string, update: (row: BulkJournalRow) => BulkJournalRow) => {
      updateRow(rowId, row =>
        reconcileVisibleValidation(row, { ...update(row), fxOverride: NO_FX_OVERRIDE }),
      );
      refreshRates(rowId);
    },
    [refreshRates, updateRow],
  );

  const setJournalDate = useCallback(
    (rowId: string, value: number) => {
      const row = latestRowsRef.current.find(item => item.id === rowId);
      if (row && rowJournalDay(row.journalDate) !== rowJournalDay(value)) {
        updateAndRefreshRates(rowId, current => ({ ...current, journalDate: value }));
        return;
      }
      updateRow(rowId, current =>
        reconcileVisibleValidation(current, { ...current, journalDate: value }),
      );
    },
    [updateAndRefreshRates, updateRow],
  );

  const setSourceAccount = useCallback(
    (rowId: string, value: AccountId) => {
      updateAndRefreshRates(rowId, row => ({ ...row, sourceId: value }));
    },
    [updateAndRefreshRates],
  );

  const setDestinationAccount = useCallback(
    (rowId: string, value: AccountId) => {
      updateAndRefreshRates(rowId, row => ({ ...row, destinationId: value }));
    },
    [updateAndRefreshRates],
  );

  const applySuggestion = useCallback(
    (rowId: string, suggestion: JournalAutofillSuggestion) => {
      analytics.trackFeatureUsage('journal', 'suggestion_accepted', {
        has_target_account: !!suggestion.targetAccountId,
        target_account_type: suggestion.targetAccountType || 'none',
        mode: 'batch',
      });
      setDescription(rowId, suggestion.description);

      const row = latestRowsRef.current.find(item => item.id === rowId);
      if (
        !row ||
        !isSimpleTargetAccountUnset(row.transactionType, row.sourceId, row.destinationId)
      ) {
        return;
      }

      const targetAccountId = resolveTargetAccountIdForSimpleTab(suggestion, row.transactionType);
      if (!targetAccountId || !accounts.some(account => account.id === targetAccountId)) return;

      if (row.transactionType === 'income') {
        setSourceAccount(rowId, targetAccountId);
      } else {
        setDestinationAccount(rowId, targetAccountId);
      }
    },
    [accounts, setDescription, setDestinationAccount, setSourceAccount],
  );

  const setTransactionType = useCallback(
    (rowId: string, value: BulkJournalRow['transactionType']) => {
      updateAndRefreshRates(rowId, row => {
        const nextAccounts = resolveGuidedAccountsAfterTabChange(
          value,
          new Map(accounts.map(account => [account.id, account])),
          row.sourceId,
          row.destinationId,
        );
        return {
          ...row,
          transactionType: value,
          sourceId: nextAccounts.sourceAccountId,
          destinationId: nextAccounts.destinationAccountId,
        };
      });
    },
    [accounts, updateAndRefreshRates],
  );

  const setConvertedAmount = useCallback(
    (rowId: string, value: number) => {
      updateRow(rowId, row => {
        const override = withConvertedAmount(
          resolveBulkRowFxPair(row, accounts, workplaceCurrency),
          sanitizeAmount(String(value)) || 0,
        );
        return override
          ? applyRates({ ...row, fxOverride: override })
          : reconcileVisibleValidation(row, row);
      });
    },
    [accounts, applyRates, updateRow, workplaceCurrency],
  );

  const setManualBaseRate = useCallback(
    (rowId: string, role: 'source' | 'destination', value: string) => {
      updateRow(rowId, row => {
        const pair = resolveBulkRowFxPair(row, accounts, workplaceCurrency);
        if (!pair.isCrossCurrency) return row;
        return applyRates({ ...row, fxOverride: withManualBaseRate(pair, role, value) });
      });
    },
    [accounts, applyRates, updateRow, workplaceCurrency],
  );

  const swapRowAccounts = useCallback(
    (rowId: string) => {
      updateAndRefreshRates(rowId, row => ({
        ...row,
        sourceId: row.destinationId,
        destinationId: row.sourceId,
      }));
    },
    [updateAndRefreshRates],
  );

  const refreshRowRate = useCallback(
    (rowId: string) => {
      updateRow(rowId, row => ({ ...row, fxOverride: NO_FX_OVERRIDE }));
      refreshRates(rowId);
    },
    [refreshRates, updateRow],
  );

  const isValid = useMemo(() => {
    if (rows.length === 0) return false;
    return rows.every(row => validateBulkJournalRow(row) === undefined && !row.isLoadingRate);
  }, [rows]);

  const isAtMaxRows = rows.length >= MAX_BULK_JOURNAL_ROWS;

  const rowActions = useMemo<BulkJournalRowActions>(
    () => ({
      setDescription,
      setNotes,
      setAmount,
      setJournalDate,
      setTransactionType,
      setSourceAccount,
      setDestinationAccount,
      setConvertedAmount,
      setManualBaseRate,
      applySuggestion,
    }),
    [
      setAmount,
      applySuggestion,
      setConvertedAmount,
      setDescription,
      setDestinationAccount,
      setJournalDate,
      setManualBaseRate,
      setNotes,
      setSourceAccount,
      setTransactionType,
    ],
  );

  const saveAll = useCallback(async () => {
    if (submissionInFlightRef.current) return;

    clearValidationTimer();
    let hasErrors = false;
    const validatedRows = latestRowsRef.current.map(row => {
      const error = validateBulkJournalRow(row);
      if (error) hasErrors = true;
      return { ...row, validationError: error };
    });

    if (hasErrors) {
      commitRows(validatedRows, false);
      setSubmitError('Please fix validation errors before saving.');
      return;
    }

    submissionInFlightRef.current = true;
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const entries = buildBulkJournalEntries(
        latestRowsRef.current,
        accounts,
        workplaceCurrency,
        workplaceId,
      );

      const result = await saveBulkJournalEntries(entries);

      if (!result.success) {
        triggerSaveOutcomeHaptic(false);
        setSubmitError(result.error || 'An error occurred while saving the journals.');
        return;
      }

      triggerSaveOutcomeHaptic(true);
      onSaveSuccess(latestRowsRef.current.length, result.summaries);
    } catch (err: unknown) {
      logger.error('Failed to save bulk journals', err);
      triggerSaveOutcomeHaptic(false);
      const message =
        err instanceof Error ? err.message : 'An error occurred while saving the journals.';
      setSubmitError(message);
    } finally {
      submissionInFlightRef.current = false;
      setIsSubmitting(false);
    }
  }, [
    accounts,
    clearValidationTimer,
    commitRows,
    workplaceId,
    workplaceCurrency,
    onSaveSuccess,
    saveBulkJournalEntries,
  ]);

  return {
    rows,
    isAtMaxRows,
    isValid,
    isSubmitting,
    submitError,
    addRow,
    removeRow,
    clearRows,
    rowActions,
    swapRowAccounts,
    refreshRowRate,
    saveAll,
  };
}
