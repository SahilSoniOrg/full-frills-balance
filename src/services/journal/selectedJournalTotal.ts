import { legSign, transactionTypeForRole } from '@/src/domain/accounting/presentationPolicy';
import { getCurrencyPrecision } from '@/src/domain/money/currencyPrecision';
import { roundToPrecision } from '@/src/domain/money/money';
import { sumByCurrency } from '@/src/domain/money/sumByCurrency';
import {
  journalFlowSignOf,
  legJournalAmount,
  postingFlowSignOf,
  viewerLegOf,
} from '@/src/services/journal/journalTimelinePresentation';
import type { JournalTimelineRow } from '@/src/services/journal/journalTimelineRows';
import type { EnrichedJournal, MoneyAmount } from '@/src/types/domainReadModels';
import { AccountType, JournalDisplayType } from '@/src/types/enums';
import type { JournalId } from '@/src/types/ids';
import type { JournalListRowId } from '@/src/types/ui';

type ResolvedRowAmount =
  { status: 'amount'; value: MoneyAmount } | { status: 'zero' } | { status: 'unavailable' };

function mixedJournalFlowAmount(journal: EnrichedJournal): ResolvedRowAmount | null {
  const flowLegs = journal.accounts.filter(
    account =>
      account.accountType === AccountType.INCOME || account.accountType === AccountType.EXPENSE,
  );
  if (flowLegs.length === 0) return null;

  const currencyCode = journal.currencyCode;
  if (!currencyCode?.trim()) return { status: 'unavailable' };

  let net = 0;
  for (const leg of flowLegs) {
    const txType = transactionTypeForRole(leg.role);
    if (!txType) continue;
    const sign = legSign(leg.accountType, txType);
    if (sign === 0) continue;
    const converted = legJournalAmount(
      journal,
      leg.currencyCode?.trim() ? leg : { ...leg, currencyCode },
    );
    if (converted == null || !Number.isFinite(converted)) {
      return { status: 'unavailable' };
    }
    net += sign * converted;
  }

  const rounded = roundToPrecision(net, getCurrencyPrecision(currencyCode));
  if (rounded === 0) return { status: 'zero' };
  return { status: 'amount', value: { amount: rounded, currencyCode } };
}

export function computeSelectedJournalsTotal(
  rows: readonly JournalTimelineRow[],
  selectedIds: ReadonlySet<JournalId>,
): { amounts: MoneyAmount[]; incomplete: boolean; includedCount: number } {
  if (selectedIds.size === 0) return { amounts: [], incomplete: false, includedCount: 0 };

  const missingIds = new Set(selectedIds);
  const includedIds = new Set<JournalId>();
  const amountByRow = new Map<JournalListRowId, ResolvedRowAmount>();

  for (const { journal, viewer, selectionId, listId } of rows) {
    if (!selectedIds.has(selectionId)) continue;
    missingIds.delete(selectionId);

    const amountId = viewer ? listId : selectionId;
    if (amountByRow.has(amountId)) continue;

    const leg = viewerLegOf(journal, viewer);
    if (!viewer && !leg && journal.displayType === JournalDisplayType.MIXED) {
      const mixed = mixedJournalFlowAmount(journal);
      if (mixed) {
        if (mixed.status === 'amount') includedIds.add(selectionId);
        amountByRow.set(amountId, mixed);
        continue;
      }
    }

    const amount = viewer ? leg?.amount : journal.totalAmount;
    const currencyCode = leg?.currencyCode || journal.currencyCode;
    if (amount == null || !Number.isFinite(amount) || !currencyCode?.trim()) {
      amountByRow.set(amountId, { status: 'unavailable' });
      continue;
    }
    const sign = leg ? postingFlowSignOf(leg) : journalFlowSignOf(journal);
    if (sign === 0) {
      amountByRow.set(amountId, { status: 'zero' });
      continue;
    }
    includedIds.add(selectionId);
    amountByRow.set(amountId, {
      status: 'amount',
      value: {
        amount: sign * amount,
        currencyCode,
      },
    });
  }

  let hasUnavailable = false;
  const available: MoneyAmount[] = [];
  for (const entry of amountByRow.values()) {
    if (entry.status === 'unavailable') hasUnavailable = true;
    else if (entry.status === 'amount') available.push(entry.value);
  }
  return {
    amounts: sumByCurrency(available),
    incomplete: missingIds.size > 0 || hasUnavailable,
    includedCount: includedIds.size,
  };
}
