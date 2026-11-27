import type { OpenItemId } from '@/src/types/ids';

export interface PersonRepaymentAllocationCandidate {
  openItemId: OpenItemId;
  availableMinor: number;
  journalDate: number;
  createdAt: number;
  id: string;
}

/** Allocate integer minor units in a stable FIFO order. `requestedAllocations: []` is explicit none. */
export function allocatePersonRepaymentMinorUnits(input: {
  amountMinor: number;
  items: readonly PersonRepaymentAllocationCandidate[];
  requestedAllocations?: readonly { openItemId: OpenItemId; amountMinor: number }[];
}): { allocations: { openItemId: OpenItemId; amountMinor: number }[]; unallocatedMinor: number } {
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor < 0)
    throw new Error('Repayment amount must be a non-negative integer number of minor units');
  const available = new Map(input.items.map(item => [item.openItemId, item.availableMinor]));
  for (const amount of available.values())
    if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('Invalid open item capacity');
  let allocations: { openItemId: OpenItemId; amountMinor: number }[];
  if (input.requestedAllocations !== undefined) {
    const seen = new Set<OpenItemId>();
    allocations = input.requestedAllocations.map(row => {
      const capacity = available.get(row.openItemId);
      if (capacity === undefined || seen.has(row.openItemId))
        throw new Error('Invalid open item selection');
      seen.add(row.openItemId);
      if (
        !Number.isSafeInteger(row.amountMinor) ||
        row.amountMinor <= 0 ||
        row.amountMinor > capacity
      )
        throw new Error('Allocation exceeds open item remainder');
      return { ...row };
    });
    if (allocations.reduce((sum, row) => sum + row.amountMinor, 0) > input.amountMinor)
      throw new Error('Allocation exceeds the repayment amount');
  } else {
    let remaining = input.amountMinor;
    allocations = [];
    for (const item of [...input.items].sort(
      (a, b) =>
        a.journalDate - b.journalDate || a.createdAt - b.createdAt || a.id.localeCompare(b.id),
    )) {
      const amountMinor = Math.min(remaining, item.availableMinor);
      if (amountMinor > 0) allocations.push({ openItemId: item.openItemId, amountMinor });
      remaining -= amountMinor;
      if (!remaining) break;
    }
  }
  return {
    allocations,
    unallocatedMinor:
      input.amountMinor - allocations.reduce((sum, row) => sum + row.amountMinor, 0),
  };
}
