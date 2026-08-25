import { journalReadService } from '@/src/services/journal/journalReadService';
import { JournalEntryLine, TabType } from '@/src/types/domainJournal';
import { JournalId, WorkplaceId } from '@/src/types/ids';
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

export type JournalEditorLoadState = 'idle' | 'loading' | 'loaded' | 'not_found' | 'error';

export function useJournalEditorLoader({
  workplaceId,
  journalId,
  hydrateEditor,
}: JournalEditorLoaderOptions): JournalEditorLoadState {
  // Derive loading from the id we have finished hydrating — avoids setState-in-effect
  // when journalId changes (edit → edit) while still blocking UI on the new id.
  const [loadResult, setLoadResult] = useState<{
    journalId: JournalId;
    state: Exclude<JournalEditorLoadState, 'idle' | 'loading'>;
  } | null>(null);
  const loadState: JournalEditorLoadState = !journalId
    ? 'idle'
    : loadResult?.journalId === journalId
      ? loadResult.state
      : 'loading';

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
          setLoadResult({ journalId, state: 'loaded' });
        } else {
          setLoadResult({ journalId, state: 'not_found' });
        }
      } catch {
        if (isActive) {
          showErrorAlert('Failed to load transaction');
          setLoadResult({ journalId, state: 'error' });
        }
      }
    };

    loadData();
    return () => {
      isActive = false;
    };
  }, [journalId, hydrateEditor, workplaceId]);

  return loadState;
}
