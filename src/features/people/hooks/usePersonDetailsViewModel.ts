import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { ACTIVE_JOURNAL_STATUSES } from '@/src/domain/journal/journalStatus';
import { useJournalEntryList } from '@/src/features/journal';
import { useObservable } from '@/src/hooks/useObservable';
import { AppNavigation } from '@/src/navigation/AppNavigation';
import { showErrorAlert, toast } from '@/src/services/feedback/alerts';
import {
  allocateUnassignedRepayment,
  linkExistingAccount,
  peopleReadService,
  setPersonArchived,
  updatePerson,
} from '@/src/services/people';
import {
  asAccountId,
  type AccountId,
  type JournalId,
  type OpenItemId,
  type PersonId,
} from '@/src/types/ids';
import { setStringAsync } from 'expo-clipboard';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { usePersonSettlementFlow } from './usePersonSettlementFlow';

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
    enabled: Boolean(detail),
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

  const settlement = usePersonSettlementFlow({
    workplaceId,
    workplaceCurrency: defaultCurrencyCode,
    detail,
    journals: journalList.journals,
    tick,
    reload: load,
  });

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

  const handleOpenAccount = useCallback(
    (accountId: AccountId) => {
      const linked = detail?.linkedAccounts.find(entry => entry.account.id === accountId);
      if (!linked) return;
      const account = linked.account;
      AppNavigation.toAccountDetails(account.id, {
        preview: {
          name: account.name,
          balance: linked.unassignedState.ledgerBalanceInNormalDirection,
          currency: account.currencyCode,
          icon: account.icon ?? undefined,
          type: account.accountType,
          colorKey: account.color ?? undefined,
        },
      });
    },
    [detail],
  );

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
    linkModalOpen,
    setLinkModalOpen,
    allocateTarget,
    setAllocateTarget,
    ...settlement,
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
    onOpenAccount: handleOpenAccount,
  };
}
