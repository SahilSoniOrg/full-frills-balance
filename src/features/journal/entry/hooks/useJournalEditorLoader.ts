import { journalQueryRepository } from '@/src/data/repositories/journal/journalTimelineModule';
import { mapEnrichedLinesToEditorState } from '@/src/services/journal/journalEditorHelpers';
import { transactionService } from '@/src/services/transaction-ingestion';
import { JournalEntryLine, JournalId, TabType, WorkplaceId } from '@/src/types/domain';
import { showErrorAlert } from '@/src/utils/alerts';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';

export interface JournalEditorHydration {
  description: string;
  notes: string;
  journalDate: string;
  journalTime: string;
  transactionType?: TabType;
  lines?: JournalEntryLine[];
  isGuidedMode?: boolean;
}

interface JournalEditorLoaderOptions {
  workplaceId: WorkplaceId;
  journalId?: JournalId;
  hydrateEditor: (snapshot: JournalEditorHydration) => void;
}

export function useJournalEditorLoader({
  workplaceId,
  journalId,
  hydrateEditor,
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
          const snapshot: JournalEditorHydration = {
            description: journal.description || '',
            notes: journal.notes || '',
            journalDate: dayjs(dateObj).format('YYYY-MM-DD'),
            journalTime: dayjs(dateObj).format('HH:mm'),
          };

          const transactions = await transactionService.getEnrichedByJournal(
            workplaceId,
            journalId,
          );
          if (!isActive) return;

          if (transactions.length > 0) {
            const { lines, forceAdvancedMode, simpleTabType } =
              mapEnrichedLinesToEditorState(transactions);
            hydrateEditor({
              ...snapshot,
              lines,
              transactionType: simpleTabType,
              isGuidedMode: forceAdvancedMode ? false : undefined,
            });
          } else {
            hydrateEditor(snapshot);
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
  }, [journalId, hydrateEditor, workplaceId]);

  return isLoading;
}
