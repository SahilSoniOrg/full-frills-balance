import { classifyPersonDebtPosting } from './personAccountPolicy';
import { AccountType, TransactionType } from '@/src/types/enums';
import type { JournalIntegrityResult, OpenItem, SettlementAllocation } from './personTypes';

export interface IntegrityPosting {
  originatingJournalId: string;
  accountId: string;
  accountType: AccountType;
  transactionType: TransactionType;
  amount: number;
}

export function evaluateJournalEditIntegrity(input: {
  journalId: string;
  items: readonly OpenItem[];
  allocations: readonly SettlementAllocation[];
  beforeLines: readonly IntegrityPosting[];
  proposedLines: readonly IntegrityPosting[];
  settlementJournalId?: string;
}): JournalIntegrityResult {
  const conflicts: { code: string; openItemIds: string[] }[] = [];
  const allocationsToDeactivate: string[] = [];
  const active = input.allocations.filter(a => a.active);
  const owned = input.items.filter(i => i.originatingJournalId === input.journalId);
  for (const item of owned) {
    const allocated = active
      .filter(a => a.openItemId === item.id)
      .reduce((s, a) => s + a.amount, 0);
    const before = input.beforeLines
      .filter(
        l =>
          l.accountId === item.accountId &&
          l.originatingJournalId === input.journalId &&
          classifyPersonDebtPosting(l) === 'increasing',
      )
      .reduce((s, l) => s + l.amount, 0);
    const after = input.proposedLines
      .filter(
        l =>
          l.accountId === item.accountId &&
          l.originatingJournalId === input.journalId &&
          classifyPersonDebtPosting(l) === 'increasing',
      )
      .reduce((s, l) => s + l.amount, 0);
    if (before > 0 && after === 0)
      conflicts.push({ code: 'origin_removed', openItemIds: [item.id] });
    else if (after < allocated)
      conflicts.push({ code: 'origin_below_allocations', openItemIds: [item.id] });
  }
  if (input.settlementJournalId) {
    const settlementAllocations = active.filter(a => a.journalId === input.settlementJournalId);
    const reducing = input.proposedLines
      .filter(
        l =>
          l.originatingJournalId === input.settlementJournalId &&
          classifyPersonDebtPosting(l) === 'reducing',
      )
      .reduce((s, l) => s + l.amount, 0);
    const allocated = settlementAllocations.reduce((s, a) => s + a.amount, 0);
    if (allocated > reducing)
      conflicts.push({
        code: 'settlement_overallocated',
        openItemIds: settlementAllocations.map(a => a.openItemId),
      });
  }
  return { allowed: conflicts.length === 0, conflicts, allocationsToDeactivate };
}

export function evaluateJournalDeleteOrReverseIntegrity(input: {
  journalId: string;
  items: readonly OpenItem[];
  allocations: readonly SettlementAllocation[];
  action: 'delete' | 'reverse';
}): JournalIntegrityResult {
  const active = input.allocations.filter(a => a.active);
  const openItemIds = input.items
    .filter(
      i => i.originatingJournalId === input.journalId && active.some(a => a.openItemId === i.id),
    )
    .map(i => i.id);
  const allocationsToDeactivate = active
    .filter(a => a.journalId === input.journalId)
    .map(a => a.id);
  const conflicts = openItemIds.length ? [{ code: 'origin_has_allocations', openItemIds }] : [];
  return { allowed: conflicts.length === 0, conflicts, allocationsToDeactivate };
}
