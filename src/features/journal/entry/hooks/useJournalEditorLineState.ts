import { AccountType, TransactionType } from '@/src/types/enums';
import { AccountId, EMPTY_ACCOUNT_ID, TransactionId } from '@/src/types/ids';
import { JournalEntryLine } from '@/src/types/domainJournal';

import { JournalCalculator } from '@/src/services/accounting/JournalCalculator';
import { useCallback, useState } from 'react';

interface UseJournalEditorLineStateProps {
  initialAmount?: string;
  initialSourceId?: AccountId;
  initialDestinationId?: AccountId;
  workplaceCurrency: string;
}

function createInitialLines({
  initialAmount,
  initialSourceId,
  initialDestinationId,
}: Omit<UseJournalEditorLineStateProps, 'workplaceCurrency'>): JournalEntryLine[] {
  return [
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
  ];
}

export function useJournalEditorLineState({
  initialAmount,
  initialSourceId,
  initialDestinationId,
  workplaceCurrency,
}: UseJournalEditorLineStateProps) {
  const [lines, setLines] = useState<JournalEntryLine[]>(() =>
    createInitialLines({ initialAmount, initialSourceId, initialDestinationId }),
  );

  const addLine = useCallback(() => {
    setLines(previous => {
      const ids = previous.map(line => parseInt(line.id)).filter(id => !isNaN(id));
      const nextId = (ids.length > 0 ? Math.max(...ids) + 1 : previous.length + 1).toString();
      return [
        ...previous,
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
    setLines(previous =>
      previous.length <= 2 ? previous : previous.filter(line => line.id !== id),
    );
  }, []);

  const updateLine = useCallback((id: string, updates: Partial<JournalEntryLine>) => {
    setLines(previous => previous.map(line => (line.id === id ? { ...line, ...updates } : line)));
  }, []);

  const updateLines = useCallback((batch: Record<string, Partial<JournalEntryLine>>) => {
    if (Object.keys(batch).length === 0) return;
    setLines(previous =>
      previous.map(line => (batch[line.id] ? { ...line, ...batch[line.id] } : line)),
    );
  }, []);

  const balanceLine = useCallback(
    (id: string) => {
      setLines(
        previous =>
          JournalCalculator.applyImbalanceRateCorrectionToLines(previous, id, workplaceCurrency) ??
          previous,
      );
    },
    [workplaceCurrency],
  );

  return { lines, setLines, addLine, removeLine, updateLine, updateLines, balanceLine };
}
