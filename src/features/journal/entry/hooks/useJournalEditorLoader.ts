import { journalQueryRepository } from '@/src/data/repositories/journal/journalTimelineModule';
import { mapEnrichedLinesToEditorState } from '@/src/services/journal/journalEditorHelpers';
import { transactionService } from '@/src/services/transaction-ingestion';
import { JournalEntryLine, JournalId, TabType, WorkplaceId } from '@/src/types/domain';
import { showErrorAlert } from '@/src/utils/alerts';
import dayjs from 'dayjs';
import { Dispatch, SetStateAction, useEffect, useState } from 'react';

interface JournalEditorLoaderOptions {
  workplaceId: WorkplaceId;
  journalId?: JournalId;
  setDescription: Dispatch<SetStateAction<string>>;
  setNotes: Dispatch<SetStateAction<string>>;
  setJournalDate: Dispatch<SetStateAction<string>>;
  setJournalTime: Dispatch<SetStateAction<string>>;
  setTransactionType: Dispatch<SetStateAction<TabType>>;
  setLines: Dispatch<SetStateAction<JournalEntryLine[]>>;
  setGuidedMode: (guided: boolean) => void;
}

export function useJournalEditorLoader({
  workplaceId,
  journalId,
  setDescription,
  setNotes,
  setJournalDate,
  setJournalTime,
  setTransactionType,
  setLines,
  setGuidedMode,
}: JournalEditorLoaderOptions): boolean {
  const [isLoading, setIsLoading] = useState(Boolean(journalId));

  useEffect(() => {
    if (!journalId) {
      return;
    }

    let isActive = true;

    const loadData = async () => {
      try {
        const journal = await journalQueryRepository.find(workplaceId, journalId);
        if (!isActive) return;

        if (journal) {
          const dateObj = new Date(journal.journalDate);
          setDescription(journal.description || '');
          setNotes(journal.notes || '');
          setJournalDate(dayjs(dateObj).format('YYYY-MM-DD'));
          setJournalTime(dayjs(dateObj).format('HH:mm'));

          const transactions = await transactionService.getEnrichedByJournal(
            workplaceId,
            journalId,
          );
          if (!isActive) return;

          if (transactions.length > 0) {
            const { lines, forceAdvancedMode, simpleTabType } =
              mapEnrichedLinesToEditorState(transactions);
            if (forceAdvancedMode) setGuidedMode(false);
            else if (simpleTabType) setTransactionType(simpleTabType);
            setLines(lines);
          }
        }
      } catch {
        if (isActive) showErrorAlert('Failed to load transaction');
      } finally {
        if (isActive) setIsLoading(false);
      }
    };

    loadData();
    return () => {
      isActive = false;
    };
  }, [
    journalId,
    setDescription,
    setGuidedMode,
    setJournalDate,
    setJournalTime,
    setLines,
    setNotes,
    setTransactionType,
    workplaceId,
  ]);

  return isLoading;
}
