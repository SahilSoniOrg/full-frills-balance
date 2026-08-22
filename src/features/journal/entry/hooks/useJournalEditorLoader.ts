import { journalReadService } from '@/src/services/journal/journalReadService';
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
  // Derive loading from the id we have finished hydrating — avoids setState-in-effect
  // when journalId changes (edit → edit) while still blocking UI on the new id.
  const [loadedJournalId, setLoadedJournalId] = useState<JournalId | null>(null);
  const isLoading = Boolean(journalId) && loadedJournalId !== journalId;

  useEffect(() => {
    if (!journalId) {
      return;
    }

    let isActive = true;

    const loadData = async () => {
      try {
        const result = await journalReadService.getJournalForEditor(workplaceId, journalId);
        if (!isActive) return;

        if (result) {
          const { journal, lines, transactionType, forceAdvancedMode } = result;
          const dateObj = new Date(journal.journalDate);
          hydrateEditor({
            description: journal.description || '',
            notes: journal.notes || '',
            journalDate: dayjs(dateObj).format('YYYY-MM-DD'),
            journalTime: dayjs(dateObj).format('HH:mm'),
            lines: lines.length > 0 ? lines : undefined,
            transactionType,
            isGuidedMode: forceAdvancedMode ? false : undefined,
          });
        }
      } catch {
        if (isActive) showErrorAlert('Failed to load transaction');
      } finally {
        if (isActive) setLoadedJournalId(journalId);
      }
    };

    loadData();
    return () => {
      isActive = false;
    };
  }, [journalId, hydrateEditor, workplaceId]);

  return isLoading;
}
