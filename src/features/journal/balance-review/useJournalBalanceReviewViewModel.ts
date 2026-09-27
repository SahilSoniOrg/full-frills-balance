import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import type { JournalBalanceLineEdit } from '@/src/domain/accounting/journalBalanceReview';
import {
  applyJournalBalanceFxSuggestions,
  loadJournalBalanceReview,
  saveJournalBalanceEdits,
  type JournalBalanceCheckSource,
  type SavedJournalBalanceReviewEntry,
} from '@/src/services/integrity';
import type { JournalId } from '@/src/types/ids';
import { toast } from '@/src/utils/alerts';
import { logger } from '@/src/utils/logger';
import { AppNavigation } from '@/src/utils/navigation';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

export interface JournalBalanceReviewViewModel {
  entries: SavedJournalBalanceReviewEntry[] | undefined;
  loadError?: string;
  isBusy: boolean;
  onApplyFxSuggestions: (journalIds: JournalId[]) => void;
  onSaveEdits: (journalId: JournalId, edits: readonly JournalBalanceLineEdit[]) => void;
  onOpenInEditor: (journalId: JournalId) => void;
  onRetry: () => void;
  onDone: () => void;
}

const openInEditor = (journalId: JournalId) => AppNavigation.toJournalEntry({ journalId });

export function useJournalBalanceReviewViewModel(): JournalBalanceReviewViewModel {
  const { workplaceId } = useWorkplace();
  const [entries, setEntries] = useState<SavedJournalBalanceReviewEntry[]>();
  const [loadError, setLoadError] = useState<string>();
  const [isBusy, setIsBusy] = useState(false);
  const loadGeneration = useRef(0);

  const reload = useCallback(
    async (source: JournalBalanceCheckSource) => {
      const generation = ++loadGeneration.current;
      setLoadError(undefined);
      try {
        const next = await loadJournalBalanceReview(workplaceId, source);
        if (generation === loadGeneration.current) setEntries(next);
      } catch (error) {
        if (generation !== loadGeneration.current) return;
        logger.error('[JournalBalanceReview] Load failed', error);
        setLoadError(error instanceof Error ? error.message : String(error));
      }
    },
    [workplaceId],
  );

  // Reload on focus so edits made in the full journal editor are reflected on return.
  useFocusEffect(
    useCallback(() => {
      void reload('review');
    }, [reload]),
  );

  /** Reloads after failures too: suggested rates save journal by journal, so some may have landed. */
  const runWrite = useCallback(
    async (source: JournalBalanceCheckSource, write: () => Promise<string>) => {
      setIsBusy(true);
      try {
        toast.success(await write());
      } catch (error) {
        logger.error('[JournalBalanceReview] Save failed', error);
        toast.error(error instanceof Error ? error.message : 'Could not save changes');
      } finally {
        await reload(source);
        setIsBusy(false);
      }
    },
    [reload],
  );

  const onApplyFxSuggestions = useCallback(
    (journalIds: JournalId[]) =>
      void runWrite('review_fx_suggestions', async () => {
        const applied = await applyJournalBalanceFxSuggestions(workplaceId, journalIds);
        return `Applied ${applied} suggested ${applied === 1 ? 'rate' : 'rates'}`;
      }),
    [runWrite, workplaceId],
  );

  const onSaveEdits = useCallback(
    (journalId: JournalId, edits: readonly JournalBalanceLineEdit[]) =>
      void runWrite('review_edit', async () => {
        await saveJournalBalanceEdits(workplaceId, journalId, edits);
        return 'Entry updated and balanced';
      }),
    [runWrite, workplaceId],
  );

  return {
    entries,
    loadError,
    isBusy,
    onApplyFxSuggestions,
    onSaveEdits,
    onOpenInEditor: openInEditor,
    onRetry: () => void reload('review'),
    onDone: AppNavigation.back,
  };
}
