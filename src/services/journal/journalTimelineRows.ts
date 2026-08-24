import { AccountId, JournalId } from '@/src/types/ids';
import { EnrichedJournal } from '@/src/types/domainReadModels';
import { JournalTimelineViewer } from '@/src/types/journalTimeline';
import { JournalListRowId } from '@/src/types/ui';

/** One journal entry row in a timeline list — the canonical list read model. */
export type JournalTimelineRow = {
  journal: EnrichedJournal;
  viewer?: JournalTimelineViewer;
  /** FlashList key; may be composite when one journal spans multiple scoped legs. */
  listId: JournalListRowId;
  /** Always the journal identity — used for selection, share, and navigation. */
  selectionId: JournalId;
};

export type JournalTimelineRowsOptions = {
  viewer?: JournalTimelineViewer;
  expandAccountIds?: AccountId[];
};

export function journalsToTimelineRows(
  journals: EnrichedJournal[],
  options?: JournalTimelineRowsOptions,
): JournalTimelineRow[] {
  const { viewer, expandAccountIds } = options ?? {};

  if (expandAccountIds && expandAccountIds.length > 0) {
    const scoped = new Set(expandAccountIds);
    const rows: JournalTimelineRow[] = [];

    for (const journal of journals) {
      const legs = journal.accounts.filter(account => scoped.has(account.id));
      for (const leg of legs) {
        rows.push({
          journal,
          viewer: { accountId: leg.id },
          listId: legs.length > 1 ? (`${journal.id}_${leg.id}` as JournalListRowId) : journal.id,
          selectionId: journal.id,
        });
      }
    }

    return rows;
  }

  return journals.map(journal => ({
    journal,
    viewer,
    listId: journal.id,
    selectionId: journal.id,
  }));
}

/** Unique enriched journals referenced by timeline rows (journal list order). */
export function journalsFromTimelineRows(rows: JournalTimelineRow[]): EnrichedJournal[] {
  const byId = new Map<JournalId, EnrichedJournal>();
  for (const row of rows) {
    byId.set(row.journal.id, row.journal);
  }
  return [...byId.values()];
}
