import { AccountType, TransactionType } from '@/src/types/enums';
import { AccountId, EMPTY_ACCOUNT_ID, TransactionId } from '@/src/types/ids';
import { JournalEntryLine } from '@/src/types/domainJournal';

import { Dispatch, SetStateAction, useCallback, useState } from 'react';

interface UseJournalEditorLineStateProps {
  initialAmount?: string;
  initialCurrencyCode?: string;
  initialSourceId?: AccountId;
  initialDestinationId?: AccountId;
}

function createInitialLines({
  initialAmount,
  initialCurrencyCode,
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
      ...(initialCurrencyCode ? { accountCurrency: initialCurrencyCode } : {}),
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
      ...(initialCurrencyCode ? { accountCurrency: initialCurrencyCode } : {}),
      transactionType: TransactionType.CREDIT,
      notes: '',
      exchangeRate: '',
    },
  ];
}

export function useJournalEditorLineState({
  initialAmount,
  initialCurrencyCode,
  initialSourceId,
  initialDestinationId,
}: UseJournalEditorLineStateProps) {
  const [lines, setLinesInternal] = useState<JournalEntryLine[]>(() =>
    createInitialLines({
      initialAmount,
      initialCurrencyCode,
      initialSourceId,
      initialDestinationId,
    }),
  );
  const protectCurrencyChange = useCallback(
    (previous: JournalEntryLine | undefined, next: JournalEntryLine): JournalEntryLine => {
      // A prefilled amount belongs to its captured currency. Selecting a different
      // currency requires a new native amount; an exchange rate cannot rename money.
      if (
        initialCurrencyCode &&
        previous &&
        next.accountCurrency &&
        next.accountCurrency !== (previous.accountCurrency || initialCurrencyCode) &&
        next.amount === previous.amount
      ) {
        return { ...next, amount: '', exchangeRate: '' };
      }
      return next;
    },
    [initialCurrencyCode],
  );
  const setLines: Dispatch<SetStateAction<JournalEntryLine[]>> = useCallback(
    update => {
      setLinesInternal(previous => {
        const next = typeof update === 'function' ? update(previous) : update;
        return next.map(line =>
          protectCurrencyChange(
            previous.find(old => old.id === line.id),
            line,
          ),
        );
      });
    },
    [protectCurrencyChange],
  );

  const addLine = useCallback(
    (transactionType: TransactionType = TransactionType.DEBIT) => {
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
    },
    [setLines],
  );

  const removeLine = useCallback(
    (id: string) => {
      setLines(previous => previous.filter(line => line.id !== id));
    },
    [setLines],
  );

  const updateLine = useCallback(
    (id: string, updates: Partial<JournalEntryLine>) => {
      setLinesInternal(previous =>
        previous.map(line => {
          if (line.id !== id) return line;
          const next = { ...line, ...updates };
          return updates.amount !== undefined ? next : protectCurrencyChange(line, next);
        }),
      );
    },
    [protectCurrencyChange],
  );

  const updateLines = useCallback(
    (batch: Record<string, Partial<JournalEntryLine>>) => {
      if (Object.keys(batch).length === 0) return;
      setLines(previous =>
        previous.map(line => (batch[line.id] ? { ...line, ...batch[line.id] } : line)),
      );
    },
    [setLines],
  );

  return { lines, setLines, addLine, removeLine, updateLine, updateLines };
}
