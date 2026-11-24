import { sumByCurrency } from '@/src/domain/money/sumByCurrency';
import {
  journalFlowSignOf,
  postingFlowSignOf,
  viewerLegOf,
} from '@/src/services/journal/journalTimelinePresentation';
import type { JournalTimelineRow } from '@/src/services/journal/journalTimelineRows';
import type { MoneyAmount } from '@/src/types/domainReadModels';
import type { JournalId } from '@/src/types/ids';
import type { JournalListRowId } from '@/src/types/ui';

export function computeSelectedJournalsTotal(
  rows: readonly JournalTimelineRow[],
  selectedIds: ReadonlySet<JournalId>,
): { amounts: MoneyAmount[]; incomplete: boolean } {
  if (selectedIds.size === 0) return { amounts: [], incomplete: false };

  const missingIds = new Set(selectedIds);
  // undefined = unavailable (marks total incomplete); null = zero-flow entry (excluded cleanly).
  const amountByRow = new Map<JournalListRowId, MoneyAmount | null | undefined>();

  for (const { journal, viewer, selectionId, listId } of rows) {
    if (!selectedIds.has(selectionId)) continue;
    missingIds.delete(selectionId);

    const amountId = viewer ? listId : selectionId;
    if (amountByRow.get(amountId) !== undefined) continue;

    const leg = viewerLegOf(journal, viewer);
    const amount = viewer ? leg?.amount : journal.totalAmount;
    const currencyCode = leg?.currencyCode || journal.currencyCode;
    if (amount == null || !Number.isFinite(amount) || !currencyCode?.trim()) {
      amountByRow.set(amountId, undefined);
      continue;
    }
    const sign = leg ? postingFlowSignOf(leg) : journalFlowSignOf(journal);
    if (sign === 0) {
      amountByRow.set(amountId, null);
      continue;
    }
    amountByRow.set(amountId, {
      amount: sign * amount,
      currencyCode,
    });
  }

  let hasUnavailable = false;
  const available: MoneyAmount[] = [];
  for (const entry of amountByRow.values()) {
    if (entry === undefined) hasUnavailable = true;
    else if (entry !== null) available.push(entry);
  }
  return {
    amounts: sumByCurrency(available),
    incomplete: missingIds.size > 0 || hasUnavailable,
  };
}
