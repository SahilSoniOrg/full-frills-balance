import { parsePositiveRate } from '@/src/domain/accounting/parsePositiveRate';
import { buildPersonShareSummary } from '@/src/domain/people/personShareSummary';
import { useShareable } from '@/src/hooks/useShareable';
import { showErrorAlert, toast } from '@/src/services/feedback/alerts';
import {
  executeWeAreSettled,
  peopleReadService,
  previewPersonSettlement,
} from '@/src/services/people';
import { createPeopleShareable } from '@/src/services/sharing/peopleShareAdapter';
import type { JournalId, WorkplaceId } from '@/src/types/ids';
import { formatShortDate } from '@/src/utils/dateFormatting';
import { useCallback, useEffect, useMemo, useState } from 'react';

type PersonDetailData = Awaited<ReturnType<typeof peopleReadService.getPersonDetail>>;

type JournalDateRow = {
  id: JournalId;
  journalDate: number;
};

type Args = {
  workplaceId: WorkplaceId;
  workplaceCurrency: string;
  detail: PersonDetailData | null;
  journals: readonly JournalDateRow[];
  tick: unknown;
  reload: () => Promise<void>;
};

/** Settle sheet, we-are-settled FX/preview, and share summary sheet controllers. */
export function usePersonSettlementFlow({
  workplaceId,
  workplaceCurrency,
  detail,
  journals,
  tick,
  reload,
}: Args) {
  const [settleSheetOpen, setSettleSheetOpen] = useState(false);
  const [settledFxOpen, setSettledFxOpen] = useState(false);
  const [settledPreviewOpen, setSettledPreviewOpen] = useState(false);
  const [fxRatesDraft, setFxRatesDraft] = useState<Record<string, string>>({});
  const [sharePreviewOpen, setSharePreviewOpen] = useState(false);
  const [shareFields, setShareFields] = useState({
    includeOpenItems: true,
    includeRepayments: true,
    includeBalances: true,
    includePaymentHandle: true,
  });

  const shareInput = useMemo(() => {
    if (!detail) return null;
    const dates = new Map(journals.map(journal => [journal.id, journal.journalDate] as const));
    return {
      workplaceId,
      recipientName: detail.person.name,
      paymentHandle: detail.person.paymentHandle,
      date: formatShortDate(new Date()),
      items: detail.openItems.map(entry => ({
        ...entry.item,
        journalDate: dates.get(entry.item.originatingJournalId),
      })),
      allocations: detail.activeAllocations.map(a => ({
        id: a.id,
        openItemId: a.openItemId,
        journalId: a.settlementJournalId,
        amount: a.amount,
        active: a.isActive,
        kind: a.allocationKind,
        journalDate: dates.get(a.settlementJournalId),
      })),
      balances: detail.balanceSummary.currencies,
      ...shareFields,
    };
  }, [detail, journals, shareFields, workplaceId]);
  const shareable = useMemo(
    () => (shareInput ? createPeopleShareable(shareInput) : null),
    [shareInput],
  );
  const sharePreview = useMemo(
    () => (shareInput ? buildPersonShareSummary(shareInput) : ''),
    [shareInput],
  );
  const share = useShareable(shareable);

  const rateMap = useMemo(() => {
    const rates = new Map<string, number>();
    for (const [currency, draft] of Object.entries(fxRatesDraft)) {
      const rate = parsePositiveRate(draft);
      if (rate !== null) rates.set(currency, rate);
    }
    return rates;
  }, [fxRatesDraft]);

  const [settlement, setSettlement] = useState<Awaited<
    ReturnType<typeof previewPersonSettlement>
  > | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isConfirmingSettlement, setIsConfirmingSettlement] = useState(false);
  const detailPersonId = detail?.person.id;

  useEffect(() => {
    if (!detailPersonId || (!settledFxOpen && !settledPreviewOpen)) return;
    let active = true;
    // Disable confirmation while the refreshed settlement is being calculated.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsPreviewing(true);
    void previewPersonSettlement(workplaceId, detailPersonId, workplaceCurrency, rateMap)
      .then(next => {
        if (active) setSettlement(next);
      })
      .catch(error => {
        if (active) {
          setSettlement(null);
          showErrorAlert(error instanceof Error ? error.message : 'Could not preview settlement');
        }
      })
      .finally(() => {
        if (active) setIsPreviewing(false);
      });
    return () => {
      active = false;
    };
  }, [
    detailPersonId,
    rateMap,
    settledFxOpen,
    settledPreviewOpen,
    tick,
    workplaceCurrency,
    workplaceId,
  ]);

  const foreignCurrencies = settlement?.foreignCurrencies ?? [];
  const settledPreview = useMemo(
    () =>
      settlement && detail
        ? {
            ...settlement,
            forgivenAccountName: detail.person.name + ' (' + settlement.forgivenAccountType + ')',
          }
        : null,
    [detail, settlement],
  );

  const handleStartWeAreSettled = useCallback(async () => {
    if (!detail || isPreviewing) return;
    setIsPreviewing(true);
    try {
      const preview = await previewPersonSettlement(
        workplaceId,
        detail.person.id,
        workplaceCurrency,
        rateMap,
      );
      setSettlement(preview);
      if (preview.foreignCurrencies.length) setSettledFxOpen(true);
      else setSettledPreviewOpen(true);
    } catch (error) {
      showErrorAlert(error instanceof Error ? error.message : 'Could not preview settlement');
    } finally {
      setIsPreviewing(false);
    }
  }, [detail, isPreviewing, rateMap, workplaceCurrency, workplaceId]);

  const handleConfirmWeAreSettled = useCallback(async () => {
    if (
      !detail ||
      !settledPreview?.plan ||
      settledPreview.blockedReason ||
      isPreviewing ||
      isConfirmingSettlement
    )
      return;
    setIsConfirmingSettlement(true);
    try {
      await executeWeAreSettled(workplaceId, {
        personId: detail.person.id,
        workplaceCurrency,
        exchangeRateByCurrency: rateMap,
        expectedPlan: settledPreview.plan,
      });
      setSettledPreviewOpen(false);
      toast.success('Balances closed.');
      await reload();
    } catch (error) {
      showErrorAlert(error instanceof Error ? error.message : 'Could not settle balances');
      setSettledPreviewOpen(false);
      setSettlement(null);
    } finally {
      setIsConfirmingSettlement(false);
    }
  }, [
    detail,
    isConfirmingSettlement,
    isPreviewing,
    rateMap,
    reload,
    settledPreview,
    workplaceCurrency,
    workplaceId,
  ]);

  return {
    settleSheetOpen,
    setSettleSheetOpen,
    settledFxOpen,
    setSettledFxOpen,
    settledPreviewOpen,
    setSettledPreviewOpen,
    fxRatesDraft,
    setFxRatesDraft,
    sharePreviewOpen,
    setSharePreviewOpen,
    shareFields,
    setShareFields,
    sharePreview,
    foreignCurrencies,
    settledPreview,
    isPreviewing,
    isConfirmingSettlement,
    onStartWeAreSettled: handleStartWeAreSettled,
    onConfirmWeAreSettled: handleConfirmWeAreSettled,
    onShare: () => setSharePreviewOpen(true),
    onConfirmShare: share.share,
  };
}
