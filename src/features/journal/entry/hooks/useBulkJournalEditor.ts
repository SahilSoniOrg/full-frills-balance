import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import Account, { AccountType } from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';
import { useExchangeRate } from '@/src/hooks/useExchangeRate';
import {
  AccountId,
  JournalEntryLine,
  WorkplaceId,
  EMPTY_ACCOUNT_ID,
  TransactionId,
} from '@/src/types/domain';
import { journalService } from '@/src/features/journal/services/JournalService';
import { generator as generateId } from '@/src/data/database/idGenerator';
import { sanitizeAmount } from '@/src/utils/validation';
import { logger } from '@/src/utils/logger';

export interface BulkJournalRow {
  id: string;
  description: string;
  amount: string;
  sourceId: AccountId;
  destinationId: AccountId;
  journalDate: number;
  exchangeRate: string; // Cross-rate (source -> destination)
  sourceBaseRate?: number; // Rate to workplace currency
  destBaseRate?: number; // Rate to workplace currency
  isCrossCurrency: boolean;
  convertedAmount: number;
  isLoadingRate: boolean;
  error?: string;
}

export type BulkRowFieldValue = string | number | boolean;

export interface SavedJournalSummary {
  description: string;
  amount: number;
  currency: string;
}

export interface UseBulkJournalEditorProps {
  workplaceId: WorkplaceId;
  workplaceCurrency: string;
  accounts: Account[];
  onSaveSuccess: (count: number, summaries: SavedJournalSummary[]) => void;
}

const generateRowId = () => generateId();

export function useBulkJournalEditor({
  workplaceId,
  workplaceCurrency,
  accounts,
  onSaveSuccess,
}: UseBulkJournalEditorProps) {
  const { fetchRate } = useExchangeRate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Initialize with one empty row
  const createRow = useCallback((prevRow?: BulkJournalRow): BulkJournalRow => {
    if (prevRow) {
      return {
        id: generateRowId(),
        description: prevRow.description,
        amount: prevRow.amount,
        sourceId: prevRow.sourceId,
        destinationId: prevRow.destinationId,
        journalDate: prevRow.journalDate,
        exchangeRate: prevRow.exchangeRate,
        sourceBaseRate: prevRow.sourceBaseRate,
        destBaseRate: prevRow.destBaseRate,
        isCrossCurrency: prevRow.isCrossCurrency,
        convertedAmount: prevRow.convertedAmount,
        isLoadingRate: false,
        error: undefined,
      };
    }
    return {
      id: generateRowId(),
      description: '',
      amount: '',
      sourceId: EMPTY_ACCOUNT_ID,
      destinationId: EMPTY_ACCOUNT_ID,
      journalDate: Date.now(),
      exchangeRate: '',
      isCrossCurrency: false,
      convertedAmount: 0,
      isLoadingRate: false,
      error: undefined,
    };
  }, []);

  const [rows, setRows] = useState<BulkJournalRow[]>(() => [createRow()]);

  // Maintain a synchronous ref for immediate reads/writes inside callbacks to prevent race conditions during rapid updates
  const latestRowsRef = useRef(rows);

  useEffect(() => {
    latestRowsRef.current = rows;
  }, [rows]);

  const addRow = useCallback(() => {
    setRows(prev => {
      const lastRow = prev[prev.length - 1];
      const nextRows = [...prev, createRow(lastRow)];
      latestRowsRef.current = nextRows;
      return nextRows;
    });
  }, [createRow]);

  const removeRow = useCallback(
    (id: string) => {
      setRows(prev => {
        const filtered = prev.filter(r => r.id !== id);
        const nextRows = filtered.length > 0 ? filtered : [createRow()];
        latestRowsRef.current = nextRows;
        return nextRows;
      });
    },
    [createRow],
  );

  const clearRows = useCallback(() => {
    const nextRows = [createRow()];
    latestRowsRef.current = nextRows;
    setRows(nextRows);
    setSubmitError(null);
  }, [createRow]);

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
          return {
            ...row,
            exchangeRate: '',
            sourceBaseRate: undefined,
            destBaseRate: undefined,
            isCrossCurrency: false,
            convertedAmount: 0,
            isLoadingRate: false,
            error: undefined,
          };
        });
        latestRowsRef.current = nextRows;
        setRows(nextRows);
        return;
      }

      // Mark row as loading rate
      const loadingRows = latestRowsRef.current.map(row => {
        if (row.id !== rowId) return row;
        return {
          ...row,
          isLoadingRate: true,
          error: undefined,
        };
      });
      latestRowsRef.current = loadingRows;
      setRows(loadingRows);

      try {
        const [srcRate, dstRate] = await Promise.all([
          sourceCurrency !== workplaceCurrency ? fetchRate(sourceCurrency, workplaceCurrency) : 1.0,
          destCurrency !== workplaceCurrency ? fetchRate(destCurrency, workplaceCurrency) : 1.0,
        ]);

        const crossRate = srcRate / dstRate;
        const numAmount = parseFloat(amountStr) || 0;
        const convertedAmount = sanitizeAmount(numAmount * crossRate) || 0;

        const successRows = latestRowsRef.current.map(row => {
          if (row.id !== rowId) return row;
          // Prevent race condition: if accounts have changed since fetch started, ignore stale results
          if (row.sourceId !== sourceId || row.destinationId !== destinationId) return row;
          return {
            ...row,
            exchangeRate: crossRate.toFixed(6),
            sourceBaseRate: srcRate,
            destBaseRate: dstRate,
            isCrossCurrency: true,
            convertedAmount,
            isLoadingRate: false,
            error: undefined,
          };
        });
        latestRowsRef.current = successRows;
        setRows(successRows);
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
          return {
            ...row,
            isLoadingRate: false,
            error: 'Rate unavailable',
          };
        });
        latestRowsRef.current = errorRows;
        setRows(errorRows);
      }
    },
    [accounts, fetchRate, workplaceCurrency],
  );

  const updateRowField = useCallback(
    (rowId: string, field: keyof BulkJournalRow, value: BulkRowFieldValue) => {
      const nextRows = latestRowsRef.current.map(row => {
        if (row.id !== rowId) return row;

        const updatedRow = { ...row, [field]: value, error: undefined };

        // Recalculate converted amount if amount changes and rate exists
        if (field === 'amount') {
          const sanitizedAmount = sanitizeAmount(value as string) || 0;
          if (row.isCrossCurrency && row.exchangeRate) {
            updatedRow.convertedAmount =
              sanitizeAmount(sanitizedAmount * parseFloat(row.exchangeRate)) || 0;
          } else {
            updatedRow.convertedAmount = 0;
          }
        }

        return updatedRow;
      });

      latestRowsRef.current = nextRows;
      setRows(nextRows);

      // If accounts changed, trigger rate lookup synchronously from the newly computed rows
      if (field === 'sourceId' || field === 'destinationId') {
        const target = nextRows.find(r => r.id === rowId);
        if (target) {
          fetchRatesForChangedAccounts(rowId, target.sourceId, target.destinationId, target.amount);
        }
      }
    },
    [fetchRatesForChangedAccounts],
  );

  const validateRow = useCallback((row: BulkJournalRow): string | undefined => {
    if (!row.description.trim()) {
      return 'Description is required';
    }
    const sanitizedVal = sanitizeAmount(row.amount);
    if (sanitizedVal === null || sanitizedVal <= 0) {
      return 'Amount must be greater than 0';
    }
    if (!row.sourceId) {
      return 'Source account is required';
    }
    if (!row.destinationId) {
      return 'Destination account is required';
    }
    if (row.sourceId === row.destinationId) {
      return 'Source and destination accounts must be distinct';
    }
    if (row.isLoadingRate) {
      return 'Exchange rate is loading...';
    }
    if (row.isCrossCurrency && (!row.exchangeRate || parseFloat(row.exchangeRate) <= 0)) {
      return 'Exchange rate is required for cross-currency';
    }
    return undefined;
  }, []);

  const isValid = useMemo(() => {
    if (rows.length === 0) return false;
    return rows.every(row => validateRow(row) === undefined && !row.isLoadingRate);
  }, [rows, validateRow]);

  const saveAll = useCallback(async () => {
    if (isSubmitting) return;

    let hasErrors = false;
    const validatedRows = latestRowsRef.current.map(row => {
      const error = validateRow(row);
      if (error) hasErrors = true;
      return { ...row, error };
    });

    if (hasErrors) {
      latestRowsRef.current = validatedRows;
      setRows(validatedRows);
      setSubmitError('Please fix validation errors before saving.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Build entries array
      const entries = latestRowsRef.current.map(row => {
        const sourceAccount = accounts.find(a => a.id === row.sourceId);
        const destAccount = accounts.find(a => a.id === row.destinationId);

        const sourceCurrency = sourceAccount?.currencyCode || workplaceCurrency;
        const destCurrency = destAccount?.currencyCode || workplaceCurrency;

        const isCross = row.isCrossCurrency;

        const lines: JournalEntryLine[] = [
          {
            id: generateId() as TransactionId,
            accountId: row.destinationId,
            accountName: destAccount?.name || '',
            accountType: destAccount?.accountType || AccountType.ASSET,
            amount: isCross ? row.convertedAmount.toFixed(2) : row.amount,
            transactionType: TransactionType.DEBIT,
            notes: '',
            exchangeRate: isCross && row.destBaseRate ? row.destBaseRate.toFixed(6) : '',
            accountCurrency: destCurrency,
          },
          {
            id: generateId() as TransactionId,
            accountId: row.sourceId,
            accountName: sourceAccount?.name || '',
            accountType: sourceAccount?.accountType || AccountType.ASSET,
            amount: row.amount,
            transactionType: TransactionType.CREDIT,
            notes: '',
            exchangeRate: isCross && row.sourceBaseRate ? row.sourceBaseRate.toFixed(6) : '',
            accountCurrency: sourceCurrency,
          },
        ];

        return { lines, description: row.description, journalDate: row.journalDate, workplaceId };
      });

      const result = await journalService.saveBulkJournalEntries(entries);

      if (!result.success) {
        setSubmitError(result.error || 'An error occurred while saving the journals.');
        return;
      }

      onSaveSuccess(latestRowsRef.current.length, result.summaries);
    } catch (err: any) {
      logger.error('Failed to save bulk journals', err);
      setSubmitError(err.message || 'An error occurred while saving the journals.');
    } finally {
      setIsSubmitting(false);
    }
  }, [accounts, workplaceId, workplaceCurrency, validateRow, isSubmitting, onSaveSuccess]);

  return {
    rows,
    isValid,
    isSubmitting,
    submitError,
    addRow,
    removeRow,
    clearRows,
    updateRowField,
    saveAll,
  };
}
