import { AccountType, TransactionType } from '@/src/types/enums';
import { AccountId, EMPTY_ACCOUNT_ID, TransactionId } from '@/src/types/ids';
import { JournalEntryLine } from '@/src/types/domainJournal';

import { useCallback, useState } from 'react';

interface UseJournalEditorLineStateProps {
  initialAmount?: string;
  initialSourceId?: AccountId;
  initialDestinationId?: AccountId;
}

function createInitialLines({
  initialAmount,
  initialSourceId,
  initialDestinationId,
}: UseJournalEditorLineStateProps): JournalEntryLine[] {
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
}: UseJournalEditorLineStateProps) {
  const [lines, setLines] = useState<JournalEntryLine[]>(() =>
    createInitialLines({ initialAmount, initialSourceId, initialDestinationId }),
  );

  const addLine = useCallback((transactionType: TransactionType = TransactionType.DEBIT) => {
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
          transactionType,
          notes: '',
          exchangeRate: '',
        },
      ];
    });
  }, []);

  const removeLine = useCallback((id: string) => {
    setLines(previous => previous.filter(line => line.id !== id));
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

  return { lines, setLines, addLine, removeLine, updateLine, updateLines };
}
