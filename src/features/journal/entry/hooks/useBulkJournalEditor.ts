import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { generator as generateId } from '@/src/data/database/idGenerator';
import { useExchangeRate } from '@/src/hooks/useExchangeRate';
import { fetchCrossCurrencyRates } from '@/src/services/currency/crossCurrencyRates';
import { AccountId, EMPTY_ACCOUNT_ID } from '@/src/types/ids';
import { MAX_BULK_JOURNAL_ROWS } from '@/src/constants';
import { useJournalActions } from '@/src/features/journal/hooks/useJournalActions';
import {
  hasManualBaseRateDraft,
  resolveManualWorkplaceRates,
  resolveWorkplaceRatesFromConvertedAmount,
} from '@/src/features/journal/entry/manualBaseRate';
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

function applyManualBaseRate(
  row: BulkJournalRow,
  accounts: AccountFields[],
  workplaceCurrency: string,
): BulkJournalRow {
  const sourceCurrency = accounts.find(account => account.id === row.sourceId)?.currencyCode;
  const destinationCurrency = accounts.find(
    account => account.id === row.destinationId,
  )?.currencyCode;
  if (!row.isCrossCurrency || !sourceCurrency || !destinationCurrency) return row;

  const resolved = resolveManualWorkplaceRates(
    sourceCurrency,
    destinationCurrency,
    workplaceCurrency,
    row.sourceBaseRateInput,
    row.destBaseRateInput,
  );
  if (!resolved) {
    if (
      hasManualBaseRateDraft(
        sourceCurrency,
        destinationCurrency,
        workplaceCurrency,
        row.sourceBaseRateInput,
        row.destBaseRateInput,
      )
    ) {
      return {
        ...row,
        rateError: row.exchangeRate ? undefined : 'Rate unavailable',
      };
    }
    return {
      ...row,
      exchangeRate: '',
      convertedAmount: 0,
      sourceBaseRate: undefined,
      destBaseRate: undefined,
      rateError: 'Rate unavailable',
    };
  }

  const amount = sanitizeAmount(row.amount) || 0;
  return {
    ...row,
    sourceBaseRate: resolved.sourceBaseRate,
    destBaseRate: resolved.destBaseRate,
    exchangeRate: resolved.exchangeRate.toFixed(6),
    convertedAmount: sanitizeAmount(amount * resolved.exchangeRate) || 0,
    rateError: undefined,
  };
}

export function useBulkJournalEditor({
  workplaceId,
  workplaceCurrency,
  accounts,
  onSaveSuccess,
}: UseBulkJournalEditorProps) {
  const { fetchRequiredRate } = useExchangeRate();
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

  const addRow = useCallback(() => {
    if (latestRowsRef.current.length >= MAX_BULK_JOURNAL_ROWS) return;
    const lastRow = latestRowsRef.current[latestRowsRef.current.length - 1];
    commitRows([...latestRowsRef.current, createRow(lastRow)]);
  }, [commitRows, createRow]);

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

  const fetchRatesForChangedAccounts = useCallback(
    async (rowId: string, sourceId: AccountId, destinationId: AccountId, amountStr: string) => {
      const sourceAccount = accounts.find(a => a.id === sourceId);
      const destAccount = accounts.find(a => a.id === destinationId);

      const sourceCurrency = sourceAccount?.currencyCode;
      const destCurrency = destAccount?.currencyCode;

      const isCross = !!(sourceCurrency && destCurrency && sourceCurrency !== destCurrency);

      if (!isCross) {
        const nextRows = latestRowsRef.current.map(row => {
          if (row.id !== rowId) return row;
          const nextRow = {
            ...row,
            exchangeRate: '',
            sourceBaseRate: undefined,
            destBaseRate: undefined,
            sourceBaseRateInput: '',
            destBaseRateInput: '',
            isCrossCurrency: false,
            convertedAmount: 0,
            isLoadingRate: false,
            validationError: getBulkJournalDuplicateAccountError(row.sourceId, row.destinationId),
            rateError: undefined,
          };
          return reconcileVisibleValidation(row, nextRow);
        });
        commitRows(nextRows);
        return;
      }

      // Mark row as loading rate
      const loadingRows = latestRowsRef.current.map(row => {
        if (row.id !== rowId) return row;
        return {
          ...row,
          isLoadingRate: true,
          rateError: undefined,
        };
      });
      commitRows(loadingRows);

      try {
        const rates = await fetchCrossCurrencyRates(
          sourceCurrency,
          destCurrency,
          workplaceCurrency,
          fetchRequiredRate,
        );
        if (!rates) {
          const noRateRows = latestRowsRef.current.map(row => {
            if (row.id !== rowId) return row;
            if (row.sourceId !== sourceId || row.destinationId !== destinationId) return row;
            if (
              hasManualBaseRateDraft(
                sourceCurrency,
                destCurrency,
                workplaceCurrency,
                row.sourceBaseRateInput,
                row.destBaseRateInput,
              )
            ) {
              const nextRow = applyManualBaseRate(
                { ...row, isCrossCurrency: true, isLoadingRate: false },
                accounts,
                workplaceCurrency,
              );
              return reconcileVisibleValidation(row, nextRow);
            }
            const nextRow = {
              ...row,
              isCrossCurrency: true,
              exchangeRate: '',
              sourceBaseRate: undefined,
              destBaseRate: undefined,
              convertedAmount: 0,
              isLoadingRate: false,
              rateError: 'Rate unavailable',
            };
            return reconcileVisibleValidation(row, nextRow);
          });
          commitRows(noRateRows);
          return;
        }
        const { sourceBaseRate: srcRate, destBaseRate: dstRate, exchangeRate: crossRate } = rates;
        const convertedAmount = sanitizeAmount((parseFloat(amountStr) || 0) * crossRate) || 0;

        const successRows = latestRowsRef.current.map(row => {
          if (row.id !== rowId) return row;
          // Prevent race condition: if accounts have changed since fetch started, ignore stale results
          if (row.sourceId !== sourceId || row.destinationId !== destinationId) return row;
          if (
            hasManualBaseRateDraft(
              sourceCurrency,
              destCurrency,
              workplaceCurrency,
              row.sourceBaseRateInput,
              row.destBaseRateInput,
            )
          ) {
            const nextRow = applyManualBaseRate(
              { ...row, isCrossCurrency: true, isLoadingRate: false },
              accounts,
              workplaceCurrency,
            );
            return reconcileVisibleValidation(row, nextRow);
          }
          const nextRow = {
            ...row,
            exchangeRate: crossRate.toFixed(6),
            sourceBaseRate: srcRate,
            destBaseRate: dstRate,
            isCrossCurrency: true,
            convertedAmount,
            isLoadingRate: false,
            rateError: undefined,
          };
          return reconcileVisibleValidation(row, nextRow);
        });
        commitRows(successRows);
      } catch (err) {
        logger.error('Failed to fetch rate for bulk row', {
          rowId,
          sourceCurrency,
          destCurrency,
          err,
        });
        const errorRows = latestRowsRef.current.map(row => {
          if (row.id !== rowId) return row;
          // Prevent race condition: if accounts have changed since fetch started, ignore stale errors
          if (row.sourceId !== sourceId || row.destinationId !== destinationId) return row;
          if (
            hasManualBaseRateDraft(
              sourceCurrency,
              destCurrency,
              workplaceCurrency,
              row.sourceBaseRateInput,
              row.destBaseRateInput,
            )
          ) {
            const nextRow = applyManualBaseRate(
              { ...row, isCrossCurrency: true, isLoadingRate: false },
              accounts,
              workplaceCurrency,
            );
            return reconcileVisibleValidation(row, nextRow);
          }
          const nextRow = {
            ...row,
            isCrossCurrency: true,
            exchangeRate: '',
            sourceBaseRate: undefined,
            destBaseRate: undefined,
            convertedAmount: 0,
            isLoadingRate: false,
            rateError: 'Rate unavailable',
          };
          return reconcileVisibleValidation(row, nextRow);
        });
        commitRows(errorRows);
      }
    },
    [accounts, commitRows, fetchRequiredRate, workplaceCurrency],
  );

  const updateRow = useCallback(
    (rowId: string, update: (row: BulkJournalRow) => BulkJournalRow) => {
      const nextRows = latestRowsRef.current.map(row => (row.id === rowId ? update(row) : row));
      commitRows(nextRows);
      return nextRows.find(row => row.id === rowId);
    },
    [commitRows],
  );

  const refreshRatesForRow = useCallback(
    (rowId: string, row: BulkJournalRow) => {
      void fetchRatesForChangedAccounts(rowId, row.sourceId, row.destinationId, row.amount);
    },
    [fetchRatesForChangedAccounts],
  );

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
      updateRow(rowId, row => {
        const sanitizedAmount = sanitizeAmount(value) || 0;
        const convertedAmount =
          row.isCrossCurrency && row.exchangeRate
            ? sanitizeAmount(sanitizedAmount * parseFloat(row.exchangeRate)) || 0
            : 0;
        return reconcileVisibleValidation(row, { ...row, amount: value, convertedAmount });
      });
    },
    [updateRow],
  );

  const setJournalDate = useCallback(
    (rowId: string, value: number) => {
      updateRow(rowId, row => reconcileVisibleValidation(row, { ...row, journalDate: value }));
    },
    [updateRow],
  );

  const updateAccountAndRefresh = useCallback(
    (rowId: string, update: (row: BulkJournalRow) => BulkJournalRow) => {
      const target = updateRow(rowId, update);
      if (target) refreshRatesForRow(rowId, target);
    },
    [refreshRatesForRow, updateRow],
  );

  const setSourceAccount = useCallback(
    (rowId: string, value: AccountId) => {
      updateAccountAndRefresh(rowId, row => {
        const nextRow = {
          ...row,
          sourceId: value,
          sourceBaseRateInput: '',
          destBaseRateInput: '',
          validationError: getBulkJournalDuplicateAccountError(value, row.destinationId),
        };
        return reconcileVisibleValidation(row, nextRow);
      });
    },
    [updateAccountAndRefresh],
  );

  const setDestinationAccount = useCallback(
    (rowId: string, value: AccountId) => {
      updateAccountAndRefresh(rowId, row => {
        const nextRow = {
          ...row,
          destinationId: value,
          sourceBaseRateInput: '',
          destBaseRateInput: '',
          validationError: getBulkJournalDuplicateAccountError(row.sourceId, value),
        };
        return reconcileVisibleValidation(row, nextRow);
      });
    },
    [updateAccountAndRefresh],
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
      updateAccountAndRefresh(rowId, row => {
        const nextAccounts = resolveGuidedAccountsAfterTabChange(
          value,
          new Map(accounts.map(account => [account.id, account])),
          row.sourceId,
          row.destinationId,
        );
        const nextRow = {
          ...row,
          transactionType: value,
          sourceId: nextAccounts.sourceAccountId,
          destinationId: nextAccounts.destinationAccountId,
          sourceBaseRateInput: '',
          destBaseRateInput: '',
          validationError: getBulkJournalDuplicateAccountError(
            nextAccounts.sourceAccountId,
            nextAccounts.destinationAccountId,
          ),
        };
        return reconcileVisibleValidation(row, nextRow);
      });
    },
    [accounts, updateAccountAndRefresh],
  );

  const setConvertedAmount = useCallback(
    (rowId: string, value: number) => {
      updateRow(rowId, row => {
        const sourceAccount = accounts.find(account => account.id === row.sourceId);
        const destinationAccount = accounts.find(account => account.id === row.destinationId);
        const convertedAmount = sanitizeAmount(String(value)) || 0;
        const rates = resolveWorkplaceRatesFromConvertedAmount({
          sourceAmount: sanitizeAmount(row.amount) || 0,
          convertedAmount,
          sourceCurrency: sourceAccount?.currencyCode ?? workplaceCurrency,
          destCurrency: destinationAccount?.currencyCode ?? workplaceCurrency,
          workplaceCurrency,
          existingSourceBaseRate: row.sourceBaseRate,
          existingDestBaseRate: row.destBaseRate,
        });

        const nextRow = rates
          ? {
              ...row,
              sourceBaseRate: rates.sourceBaseRate,
              destBaseRate: rates.destBaseRate,
              exchangeRate: rates.exchangeRate.toFixed(6),
              convertedAmount,
            }
          : { ...row, convertedAmount };
        return reconcileVisibleValidation(row, nextRow);
      });
    },
    [accounts, updateRow, workplaceCurrency],
  );

  const setManualBaseRate = useCallback(
    (rowId: string, role: 'source' | 'destination', value: string) => {
      const target = updateRow(rowId, row =>
        reconcileVisibleValidation(
          row,
          applyManualBaseRate(
            {
              ...row,
              [role === 'source' ? 'sourceBaseRateInput' : 'destBaseRateInput']: value,
            },
            accounts,
            workplaceCurrency,
          ),
        ),
      );
      if (!target?.isCrossCurrency) return;

      const sourceCurrency = accounts.find(account => account.id === target.sourceId)?.currencyCode;
      const destCurrency = accounts.find(
        account => account.id === target.destinationId,
      )?.currencyCode;
      if (
        sourceCurrency &&
        destCurrency &&
        !hasManualBaseRateDraft(
          sourceCurrency,
          destCurrency,
          workplaceCurrency,
          target.sourceBaseRateInput,
          target.destBaseRateInput,
        )
      ) {
        refreshRatesForRow(rowId, target);
      }
    },
    [accounts, refreshRatesForRow, updateRow, workplaceCurrency],
  );

  const swapRowAccounts = useCallback(
    (rowId: string) => {
      const row = latestRowsRef.current.find(item => item.id === rowId);
      if (!row) return;

      const nextRows = latestRowsRef.current.map(item => {
        if (item.id !== rowId) return item;
        const nextRow = {
          ...item,
          sourceId: row.destinationId,
          destinationId: row.sourceId,
          sourceBaseRateInput: '',
          destBaseRateInput: '',
          validationError: getBulkJournalDuplicateAccountError(row.destinationId, row.sourceId),
        };
        return reconcileVisibleValidation(item, nextRow);
      });

      commitRows(nextRows);

      void fetchRatesForChangedAccounts(rowId, row.destinationId, row.sourceId, row.amount);
    },
    [commitRows, fetchRatesForChangedAccounts],
  );

  const refreshRowRate = useCallback(
    (rowId: string) => {
      const row = latestRowsRef.current.find(item => item.id === rowId);
      if (!row) return;

      const nextRows = latestRowsRef.current.map(item =>
        item.id === rowId ? { ...item, sourceBaseRateInput: '', destBaseRateInput: '' } : item,
      );
      commitRows(nextRows);

      void fetchRatesForChangedAccounts(rowId, row.sourceId, row.destinationId, row.amount);
    },
    [commitRows, fetchRatesForChangedAccounts],
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
