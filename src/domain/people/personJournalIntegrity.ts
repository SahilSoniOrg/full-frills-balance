import { classifyPersonDebtPosting } from './personAccountPolicy';
import { AccountType, TransactionType } from '@/src/types/enums';
import type { JournalIntegrityResult, OpenItem, SettlementAllocation } from './personTypes';

export interface IntegrityPosting {
  originatingJournalId: string;
  accountId: string;
  accountType: AccountType;
  transactionType: TransactionType;
  amount: number;
  precision?: number;
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
    const precision =
      input.proposedLines.find(l => l.accountId === item.accountId)?.precision ??
      input.beforeLines.find(l => l.accountId === item.accountId)?.precision ??
      2;
    const scale = 10 ** precision;
    const imprecise = [...input.beforeLines, ...input.proposedLines]
      .filter(line => line.accountId === item.accountId)
      .some(line => Math.abs(line.amount * scale - Math.round(line.amount * scale)) > 1e-7);
    const minor = (amount: number) => {
      const scaled = amount * 10 ** precision;
      return Number.isFinite(scaled) ? Math.round(scaled) : 0;
    };
    const allocated = active
      .filter(a => a.openItemId === item.id)
      .reduce((s, a) => s + minor(a.amount), 0);
    if (imprecise) conflicts.push({ code: 'invalid_minor_unit_precision', openItemIds: [item.id] });
    const before = input.beforeLines
      .filter(
        l =>
          l.accountId === item.accountId &&
          l.originatingJournalId === input.journalId &&
          classifyPersonDebtPosting(l) === 'increasing',
      )
      .reduce((s, l) => s + minor(l.amount), 0);
    const after = input.proposedLines
      .filter(
        l =>
          l.accountId === item.accountId &&
          l.originatingJournalId === input.journalId &&
          classifyPersonDebtPosting(l) === 'increasing',
      )
      .reduce((s, l) => s + minor(l.amount), 0);
    if (before > 0 && after === 0 && allocated > 0)
      conflicts.push({ code: 'origin_removed', openItemIds: [item.id] });
    else if (after < allocated)
      conflicts.push({ code: 'origin_below_allocations', openItemIds: [item.id] });
  }
  if (input.settlementJournalId) {
    const settlementAllocations = active.filter(a => a.journalId === input.settlementJournalId);
    const precisionForAccount = (accountId: string) =>
      input.proposedLines.find(l => l.accountId === accountId)?.precision ??
      input.beforeLines.find(l => l.accountId === accountId)?.precision ??
      2;
    const reducingByAccount = new Map<string, number>();
    for (const line of input.proposedLines.filter(
      l =>
        l.originatingJournalId === input.settlementJournalId &&
        classifyPersonDebtPosting(l) === 'reducing',
    )) {
      const scale = 10 ** precisionForAccount(line.accountId);
      reducingByAccount.set(
        line.accountId,
        (reducingByAccount.get(line.accountId) ?? 0) + Math.round(line.amount * scale),
      );
    }
    const allocatedByAccount = new Map<string, number>();
    for (const allocation of settlementAllocations) {
      const accountId =
        allocation.accountId ??
        input.items.find(candidate => candidate.id === allocation.openItemId)?.accountId;
      if (!accountId) continue;
      const scale = 10 ** precisionForAccount(accountId);
      allocatedByAccount.set(
        accountId,
        (allocatedByAccount.get(accountId) ?? 0) + Math.round(allocation.amount * scale),
      );
    }
    const overallocated = [...allocatedByAccount].filter(
      ([accountId, allocated]) => allocated > (reducingByAccount.get(accountId) ?? 0),
    );
    const imprecise = input.proposedLines
      .filter(line => line.originatingJournalId === input.settlementJournalId)
      .some(
        line =>
          Math.abs(
            line.amount * 10 ** precisionForAccount(line.accountId) -
              Math.round(line.amount * 10 ** precisionForAccount(line.accountId)),
          ) > 1e-7,
      );
    if (imprecise)
      conflicts.push({
        code: 'invalid_minor_unit_precision',
        openItemIds: settlementAllocations.map(a => a.openItemId),
      });
    if (overallocated.length)
      conflicts.push({
        code: 'settlement_overallocated',
        openItemIds: settlementAllocations
          .filter(a =>
            overallocated.some(
              ([accountId]) =>
                (a.accountId ?? input.items.find(item => item.id === a.openItemId)?.accountId) ===
                accountId,
            ),
          )
          .map(a => a.openItemId),
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
