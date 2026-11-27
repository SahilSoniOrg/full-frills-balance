import { useEffect, useMemo, useState } from 'react';
import { peopleReadService } from '@/src/services/people';
import type { OpenItemId, PersonId, WorkplaceId } from '@/src/types/ids';

export type TransferOpenItem = {
  item: { id: OpenItemId; originalAmount: number; currencyCode: string };
  remainder: number;
};
export function buildTransferOpenItemAllocations(
  items: readonly TransferOpenItem[],
  selectedItemIds: Record<string, boolean>,
  amount: number,
  allocationMode: 'fifo' | 'pick',
) {
  const active = items.filter(item => allocationMode === 'fifo' || selectedItemIds[item.item.id]);
  let remaining = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  return active
    .map(({ item, remainder }) => {
      const allocation = Math.min(remainder, remaining);
      remaining -= allocation;
      return { openItemId: item.id, amount: allocation };
    })
    .filter(allocation => allocation.amount > 0);
}
export function buildTransferOpenItemQuickFillChips(
  items: readonly TransferOpenItem[],
  _precision: number,
) {
  const total = items.reduce((sum, item) => sum + item.remainder, 0);
  const baseChips = [
    { id: 'full', label: 'Full balance', amount: total },
    { id: 'half', label: 'Half', amount: total / 2 },
  ];
  if (items.length <= 1) return baseChips;
  return [
    ...baseChips,
    ...items.slice(0, 2).map((x, index) => ({
      id: x.item.id,
      label: `Item ${index + 1}`,
      amount: x.remainder,
    })),
  ];
}

type Props = {
  workplaceId: WorkplaceId;
  workplaceCurrency: string;
  personId?: PersonId;
  initialOpenItemId?: OpenItemId;
  transferAmountText: string;
  precision?: number;
  currencyCode?: string;
};
export function useTransferOpenItems({
  workplaceId,
  workplaceCurrency,
  personId,
  initialOpenItemId,
  transferAmountText,
  precision = 2,
  currencyCode,
}: Props) {
  const [openItems, setOpenItems] = useState<
    {
      item: { id: OpenItemId; originalAmount: number; currencyCode: string };
      remainder: number;
    }[]
  >([]);
  const [allocationMode, setAllocationMode] = useState<'fifo' | 'pick'>(
    initialOpenItemId ? 'pick' : 'fifo',
  );
  const [selectedItemIds, setSelectedItemIds] = useState<Record<string, boolean>>(
    initialOpenItemId ? { [initialOpenItemId]: true } : {},
  );
  useEffect(() => {
    let live = true;
    if (!personId) {
      return () => {
        live = false;
      };
    }
    peopleReadService.getPersonDetail(workplaceId, personId, workplaceCurrency).then(detail => {
      if (live) setOpenItems((detail?.openItems ?? []).filter(x => x.remainder > 0));
    });
    return () => {
      live = false;
    };
  }, [workplaceId, workplaceCurrency, personId]);
  const activeCurrency = currencyCode ?? workplaceCurrency;
  const items = useMemo(
    () => openItems.filter(x => x.item.currencyCode === activeCurrency),
    [openItems, activeCurrency],
  );
  const totalOpenRemainder = items.reduce((sum, x) => sum + x.remainder, 0);
  const quickFillChips = buildTransferOpenItemQuickFillChips(items, precision);
  const requested = Number(transferAmountText.replace(/,/g, ''));
  const selectedAllocations = buildTransferOpenItemAllocations(
    items,
    selectedItemIds,
    requested,
    allocationMode,
  );
  return {
    openItems: items,
    allocationMode,
    setAllocationMode,
    selectedItemIds,
    setSelectedItemIds,
    totalOpenRemainder,
    quickFillChips,
    selectedAllocations,
  };
}
