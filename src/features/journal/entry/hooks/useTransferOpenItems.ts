import { useMemo, useState } from 'react';
import { of } from 'rxjs';
import { allocatePersonRepaymentMinorUnits } from '@/src/domain/people/personRepaymentAllocation';
import { fromMinorUnits, toMinorUnits } from '@/src/domain/money/money';
import { useObservable } from '@/src/hooks/useObservable';
import { peopleReadService } from '@/src/services/people';
import type { AccountId, OpenItemId, PersonId, WorkplaceId } from '@/src/types/ids';

export type TransferOpenItem = {
  item: {
    id: OpenItemId;
    originalAmount: number;
    currencyCode: string;
    journalDate?: number;
    createdAt?: number;
  };
  remainder: number;
};

export function buildTransferOpenItemAllocations(
  items: readonly TransferOpenItem[],
  selectedItemIds: Record<string, boolean>,
  amount: number,
  allocationMode: 'fifo' | 'pick',
  precision = 2,
) {
  const units = toMinorUnits(amount, precision);
  if (!Number.isSafeInteger(units) || units <= 0) return [];
  const eligible = items.filter(
    ({ item }) => allocationMode === 'fifo' || selectedItemIds[item.id],
  );
  const planned = allocatePersonRepaymentMinorUnits({
    amountMinor: units,
    items: eligible.map(({ item, remainder }) => ({
      openItemId: item.id,
      availableMinor: toMinorUnits(remainder, precision),
      journalDate: item.journalDate ?? item.createdAt ?? 0,
      createdAt: item.createdAt ?? 0,
      id: item.id,
    })),
  });
  return planned.allocations.map(row => ({
    openItemId: row.openItemId,
    amount: fromMinorUnits(row.amountMinor, precision),
  }));
}

export function buildTransferOpenItemQuickFillChips(
  items: readonly TransferOpenItem[],
  precision: number,
) {
  if (!items.length) return [];
  const total = items.reduce((sum, row) => sum + toMinorUnits(row.remainder, precision), 0);
  return [
    { id: 'full', label: 'Full balance', amount: fromMinorUnits(total, precision) },
    { id: 'half', label: 'Half', amount: fromMinorUnits(Math.round(total / 2), precision) },
    ...(items.length > 1
      ? items.slice(0, 2).map(({ item, remainder }, index) => ({
          id: item.id,
          label: 'Item ' + (index + 1),
          amount: remainder,
        }))
      : []),
  ];
}

const EMPTY: TransferOpenItem[] = [];
type Props = {
  workplaceId?: WorkplaceId;
  personId?: PersonId;
  accountId?: AccountId;
  initialOpenItemId?: OpenItemId;
  transferAmount: number;
  precision: number;
};

export function useTransferOpenItems({
  workplaceId,
  personId,
  accountId,
  initialOpenItemId,
  transferAmount,
  precision,
}: Props) {
  const scope = JSON.stringify([workplaceId, personId, accountId]);
  const [selection, setSelection] = useState<{
    scope: string;
    allocationMode: 'fifo' | 'pick';
    selectedItemIds: Record<string, boolean>;
  }>();
  const {
    data: items,
    isLoading,
    error,
  } = useObservable(
    () =>
      workplaceId && personId && accountId
        ? peopleReadService.observeOpenItems(workplaceId, personId, accountId)
        : of(EMPTY),
    [workplaceId, personId, accountId],
    EMPTY,
    { resetKey: scope },
  );
  const initialItemInScope = items.find(
    row => row.item.id === initialOpenItemId && row.remainder > 0,
  )?.item.id;
  const scoped = selection?.scope === scope ? selection : undefined;
  const allocationMode = scoped?.allocationMode ?? (initialItemInScope ? 'pick' : 'fifo');
  const selectedItemIds = useMemo(
    () => scoped?.selectedItemIds ?? (initialItemInScope ? { [initialItemInScope]: true } : {}),
    [initialItemInScope, scoped],
  );
  const selectedAllocations = useMemo(
    () =>
      buildTransferOpenItemAllocations(
        items,
        selectedItemIds,
        transferAmount,
        allocationMode,
        precision,
      ),
    [allocationMode, items, precision, selectedItemIds, transferAmount],
  );
  const quickFillChips = buildTransferOpenItemQuickFillChips(items, precision);
  return {
    openItems: items,
    isLoading,
    error,
    allocationMode,
    unresolvedInitialSelection: Boolean(initialOpenItemId && !initialItemInScope && !scoped),
    setAllocationMode: (mode: 'fifo' | 'pick') =>
      setSelection({ scope, allocationMode: mode, selectedItemIds }),
    selectedItemIds,
    toggleItem: (id: OpenItemId) =>
      setSelection(previous => {
        const current = previous?.scope === scope ? previous.selectedItemIds : selectedItemIds;
        return { scope, allocationMode, selectedItemIds: { ...current, [id]: !current[id] } };
      }),
    selectOnlyItem: (id: string) =>
      setSelection({ scope, allocationMode: 'pick', selectedItemIds: { [id]: true } }),
    totalOpenRemainder: quickFillChips[0]?.amount ?? 0,
    quickFillChips,
    selectedAllocations,
  };
}
