import { generator as generateId } from '@/src/data/database/idGenerator';
import { createEmptySplitRow, SplitRowState } from '@/src/services/journal/splitJournalHelpers';
import { AccountId, EMPTY_ACCOUNT_ID } from '@/src/types/ids';
import { useCallback, useState } from 'react';

export function useSplitEntryState() {
  const [sourceAccountId, setSourceAccountId] = useState<AccountId>(EMPTY_ACCOUNT_ID);
  const [totalAmount, setTotalAmount] = useState('');
  const [splits, setSplits] = useState<SplitRowState[]>(() => [
    createEmptySplitRow(generateId()),
    createEmptySplitRow(generateId()),
  ]);

  const addSplitRow = useCallback(() => {
    setSplits(prev => [...prev, createEmptySplitRow(generateId())]);
  }, []);

  const removeSplitRow = useCallback((id: string) => {
    setSplits(prev => (prev.length <= 2 ? prev : prev.filter(row => row.id !== id)));
  }, []);

  const updateSplitRow = useCallback(
    (id: string, patch: Partial<Pick<SplitRowState, 'accountId' | 'amount'>>) => {
      setSplits(prev => prev.map(row => (row.id === id ? { ...row, ...patch } : row)));
    },
    [],
  );

  return {
    sourceAccountId,
    setSourceAccountId,
    totalAmount,
    setTotalAmount,
    splits,
    addSplitRow,
    removeSplitRow,
    updateSplitRow,
  };
}
