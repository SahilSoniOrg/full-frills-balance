import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { ACTIVE_JOURNAL_STATUSES } from '@/src/domain/journal/journalStatus';
import { parsePositiveRate } from '@/src/domain/accounting/parsePositiveRate';
import { buildPersonShareSummary } from '@/src/domain/people/personShareSummary';
import { useJournalEntryList } from '@/src/features/journal';
import { useObservable } from '@/src/hooks/useObservable';
import { useShareable } from '@/src/hooks/useShareable';
import { AppNavigation } from '@/src/navigation/AppNavigation';
import { showErrorAlert, toast } from '@/src/services/feedback/alerts';
import {
  allocateUnassignedRepayment,
  executeWeAreSettled,
  linkExistingAccount,
  peopleReadService,
  previewPersonSettlement,
  setPersonArchived,
  updatePerson,
} from '@/src/services/people';
import { createPeopleShareable } from '@/src/services/sharing/peopleShareAdapter';
import {
  asAccountId,
  type AccountId,
  type JournalId,
  type OpenItemId,
  type PersonId,
} from '@/src/types/ids';
import { formatShortDate } from '@/src/utils/dateFormatting';
import { setStringAsync } from 'expo-clipboard';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

type PersonDetailData = Awaited<ReturnType<typeof peopleReadService.getPersonDetail>>;
type LinkableAccount = Awaited<
  ReturnType<typeof peopleReadService.listLinkableAccountsForPeople>
>[number];

export function usePersonDetailsViewModel() {
  const { personId } = useLocalSearchParams<{ personId: PersonId }>();
  const { workplaceId, defaultCurrencyCode } = useWorkplace();
  const { version: tick } = useObservable(
    () => peopleReadService.observePeopleTick(workplaceId),
    [workplaceId],
    null,
  );

  const scope = JSON.stringify([workplaceId, personId]);
  const latestScope = useRef(scope);
  useLayoutEffect(() => {
    latestScope.current = scope;
  }, [scope]);
  const loadRequest = useRef(0);
  const [snapshot, setSnapshot] = useState<{
    scope: string;
    detail: PersonDetailData;
  }>();
  const detail = snapshot?.scope === scope ? snapshot.detail : null;
  const [linkableAccounts, setLinkableAccounts] = useState<LinkableAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [allocateTarget, setAllocateTarget] = useState<{
    accountId: AccountId;
    settlementJournalId: JournalId;
    amount: number;
  } | null>(null);
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

  const linkedAccountIdsKey = useMemo(
    () => (detail?.linkedAccounts.map(linked => linked.account.id) ?? []).slice().sort().join('|'),
    [detail],
  );
  const linkedAccountIds = useMemo<AccountId[]>(
    () => (linkedAccountIdsKey ? linkedAccountIdsKey.split('|').map(asAccountId) : []),
    [linkedAccountIdsKey],
  );

  const journalList = useJournalEntryList({
    workplaceId,
    enabled: Boolean(detail && linkedAccountIds.length > 0),
    statuses: [...ACTIVE_JOURNAL_STATUSES],
    // One card per journal (not per linked leg). Expanding scoped legs duplicates
    // transfers that touch two accounts for the same person.
    queryOptions: { accountIds: linkedAccountIds },
    disableSelection: true,
    shareTitle: detail ? `Activity with ${detail.person.name}` : 'Person activity',
  });

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!personId) {
        setIsLoading(false);
        return;
      }
      const request = ++loadRequest.current;
      try {
        const nextDetail = await peopleReadService.getPersonDetail(
          workplaceId,
          personId,
          defaultCurrencyCode,
        );
        if (signal?.aborted || latestScope.current !== scope || request !== loadRequest.current)
          return;
        setSnapshot({ scope, detail: nextDetail });
      } catch (error) {
        if (!signal?.aborted)
          showErrorAlert(error instanceof Error ? error.message : 'Could not load person');
      } finally {
        if (!signal?.aborted && latestScope.current === scope && request === loadRequest.current)
          setIsLoading(false);
      }
    },
    [defaultCurrencyCode, personId, scope, workplaceId],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => void load(controller.signal), 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [load, tick]);

  useEffect(() => {
    if (!linkModalOpen) return;
    let active = true;
    // Clear the prior request's accounts when reopening the picker.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLinkableAccounts([]);
    void peopleReadService
      .listLinkableAccountsForPeople(workplaceId)
      .then(accounts => {
        if (active) setLinkableAccounts(accounts);
      })
      .catch(error => {
        if (active)
          showErrorAlert(error instanceof Error ? error.message : 'Could not load accounts');
      });
    return () => {
      active = false;
    };
  }, [linkModalOpen, workplaceId]);

  const shareInput = useMemo(() => {
    if (!detail) return null;
    const dates = new Map(
      journalList.journals.map(journal => [journal.id, journal.journalDate] as const),
    );
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
  }, [detail, journalList.journals, shareFields, workplaceId]);
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
    void previewPersonSettlement(workplaceId, detailPersonId, defaultCurrencyCode, rateMap)
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
    defaultCurrencyCode,
    detailPersonId,
    rateMap,
    settledFxOpen,
    settledPreviewOpen,
    tick,
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

  const handleToggleArchive = useCallback(async () => {
    if (!detail) return;
    try {
      const next = !detail.person.archivedAt;
      await setPersonArchived(workplaceId, detail.person.id, next);
      toast.success(next ? 'Archived person.' : 'Unarchived person.');
      await load();
    } catch (error) {
      showErrorAlert(error instanceof Error ? error.message : 'Could not update archive status');
    }
  }, [detail, load, workplaceId]);

  const handleTogglePin = useCallback(async () => {
    if (!detail) return;
    try {
      const next = !detail.person.isPinned;
      await updatePerson(workplaceId, detail.person.id, { isPinned: next });
      toast.success(next ? 'Pinned to top.' : 'Unpinned person.');
      await load();
    } catch (error) {
      showErrorAlert(error instanceof Error ? error.message : 'Could not update pin state');
    }
  }, [detail, load, workplaceId]);

  const handleCopyPaymentHandle = useCallback(async () => {
    const handle = detail?.person.paymentHandle?.trim();
    if (!handle) return;
    await setStringAsync(handle);
    toast.success('Copied payment handle.');
  }, [detail]);

  const handleLinkAccount = useCallback(
    async (accountId: AccountId) => {
      if (!detail) return;
      try {
        await linkExistingAccount(workplaceId, detail.person.id, accountId);
        setLinkModalOpen(false);
        toast.success('Account linked.');
        await load();
      } catch (error) {
        showErrorAlert(error instanceof Error ? error.message : 'Could not link account');
      }
    },
    [detail, load, workplaceId],
  );

  const handleApplyUnassigned = useCallback(
    async (openItemId: OpenItemId) => {
      if (!detail || !allocateTarget) return;
      const openEntry = detail.openItems.find(o => o.item.id === openItemId);
      if (!openEntry) return;
      const amount = Math.min(allocateTarget.amount, openEntry.remainder);
      try {
        await allocateUnassignedRepayment(workplaceId, {
          personId: detail.person.id,
          targetAccountId: allocateTarget.accountId,
          settlementJournalId: allocateTarget.settlementJournalId,
          allocations: [{ openItemId, amount }],
        });
        setAllocateTarget(null);
        toast.success('Applied repayment to open item.');
        await load();
      } catch (error) {
        showErrorAlert(error instanceof Error ? error.message : 'Could not allocate repayment');
      }
    },
    [allocateTarget, detail, load, workplaceId],
  );

  const handleStartWeAreSettled = useCallback(async () => {
    if (!detail || isPreviewing) return;
    setIsPreviewing(true);
    try {
      const preview = await previewPersonSettlement(
        workplaceId,
        detail.person.id,
        defaultCurrencyCode,
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
  }, [defaultCurrencyCode, detail, isPreviewing, rateMap, workplaceId]);

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
        workplaceCurrency: defaultCurrencyCode,
        exchangeRateByCurrency: rateMap,
        expectedPlan: settledPreview.plan,
      });
      setSettledPreviewOpen(false);
      toast.success('Balances closed.');
      await load();
    } catch (error) {
      showErrorAlert(error instanceof Error ? error.message : 'Could not settle balances');
      setSettledPreviewOpen(false);
      setSettlement(null);
    } finally {
      setIsConfirmingSettlement(false);
    }
  }, [
    defaultCurrencyCode,
    detail,
    isConfirmingSettlement,
    isPreviewing,
    load,
    rateMap,
    settledPreview,
    workplaceId,
  ]);

  return {
    personId,
    workplaceCurrency: defaultCurrencyCode,
    detail,
    journalItems: journalList.items,
    isLoadingActivity: journalList.isLoading,
    isLoadingMoreActivity: journalList.isLoadingMore,
    activityError: journalList.error,
    retryActivity: journalList.retry,
    onEndReachedActivity: journalList.onEndReached,
    linkableAccounts,
    isLoading,
    foreignCurrencies,
    settledPreview,
    isPreviewing,
    isConfirmingSettlement,
    linkModalOpen,
    setLinkModalOpen,
    allocateTarget,
    setAllocateTarget,
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
    onBack: AppNavigation.back,
    onSplitExpense: () =>
      detail && AppNavigation.toSplitJournalEntry({ personId: detail.person.id }),
    onSettleUp: (openItemId?: OpenItemId) =>
      detail && AppNavigation.toTransferRepayment({ personId: detail.person.id, openItemId }),
    onMatchExisting: () =>
      detail && AppNavigation.toSettleUp({ personId: detail.person.id, mode: 'match' }),
    onEditProfile: () => detail && AppNavigation.toPersonEdit(detail.person.id, workplaceId),
    onToggleArchive: handleToggleArchive,
    onTogglePin: handleTogglePin,
    onCopyPaymentHandle: handleCopyPaymentHandle,
    onLinkAccount: handleLinkAccount,
    onApplyUnassigned: handleApplyUnassigned,
    onStartWeAreSettled: handleStartWeAreSettled,
    onConfirmWeAreSettled: handleConfirmWeAreSettled,
    onShare: () => setSharePreviewOpen(true),
    onConfirmShare: share.share,
  };
}
