import { useEffect, useMemo, useState } from 'react';
import { peopleReadService } from '@/src/services/people';
import type { RepaymentAllocationInput } from '@/src/services/people';
import type { OpenItemId, PersonId, WorkplaceId } from '@/src/types/ids';

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
    Array<{
      item: { id: OpenItemId; originalAmount: number; currencyCode: string };
      remainder: number;
    }>
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
      setOpenItems([]);
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
  const quickFillChips = [
    { id: 'full', label: 'Full balance', amount: totalOpenRemainder },
    { id: 'half', label: 'Half', amount: totalOpenRemainder / 2 },
    ...items.slice(0, 2).map(x => ({
      id: x.item.id,
      label: x.item.currencyCode + ' ' + x.item.originalAmount.toFixed(precision),
      amount: x.remainder,
    })),
  ];
  const requested = Number(transferAmountText.replace(/,/g, ''));
  let remaining = Number.isFinite(requested) ? Math.max(0, requested) : 0;
  const selectedAllocations: RepaymentAllocationInput[] =
    allocationMode === 'pick'
      ? items
          .filter(x => selectedItemIds[x.item.id])
          .map(x => {
            const amount = Math.min(x.remainder, remaining);
            remaining -= amount;
            return { openItemId: x.item.id, amount };
          })
          .filter(x => x.amount > 0)
      : [];
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
