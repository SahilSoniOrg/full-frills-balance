import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { planWeAreSettled } from '@/src/domain/people';
import { getCurrencyPrecision } from '@/src/domain/money/currencyPrecision';
import { useObservable } from '@/src/hooks/useObservable';
import { useShareable } from '@/src/hooks/useShareable';
import { AppNavigation } from '@/src/navigation/AppNavigation';
import { showErrorAlert, toast } from '@/src/services/feedback/alerts';
import {
  allocateUnassignedRepayment,
  executeWeAreSettled,
  linkExistingAccount,
  peopleReadService,
  renamePerson,
  setPersonArchived,
} from '@/src/services/people';
import { createPeopleShareable } from '@/src/services/sharing/peopleShareAdapter';
import { buildPersonShareSummary } from '@/src/domain/people/personShareSummary';
import { AccountType } from '@/src/types/enums';
import type { AccountId, JournalId, OpenItemId, PersonId } from '@/src/types/ids';
import { formatShortDate } from '@/src/utils/dateFormatting';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';

type PersonDetailData = Awaited<ReturnType<typeof peopleReadService.getPersonDetail>>;
type LinkableAccount = Awaited<
  ReturnType<typeof peopleReadService.listLinkableAccountsForPeople>
>[number];
type HistoryRow = Awaited<ReturnType<typeof peopleReadService.listPersonJournalHistory>>[number];

export function usePersonDetailsViewModel() {
  const { personId } = useLocalSearchParams<{ personId: PersonId }>();
  const { workplaceId, defaultCurrencyCode } = useWorkplace();
  const { data: tick } = useObservable(
    () => peopleReadService.observePeopleTick(workplaceId),
    [workplaceId],
    null,
  );

  const [detail, setDetail] = useState<PersonDetailData>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [linkableAccounts, setLinkableAccounts] = useState<LinkableAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
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
  });

  const load = useCallback(async () => {
    if (!personId) {
      setIsLoading(false);
      return;
    }
    try {
      const [nextDetail, nextHistory, nextLinkable] = await Promise.all([
        peopleReadService.getPersonDetail(workplaceId, personId, defaultCurrencyCode),
        peopleReadService.listPersonJournalHistory(workplaceId, personId),
        peopleReadService.listLinkableAccountsForPeople(workplaceId),
      ]);
      setDetail(nextDetail);
      setHistory(nextHistory);
      setLinkableAccounts(nextLinkable);
    } finally {
      setIsLoading(false);
    }
  }, [defaultCurrencyCode, personId, workplaceId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, [load, tick]);

  const shareInput = useMemo(() => {
    if (!detail) return null;
    const dates = new Map(history.map(row => [row.journalId, row.journalDate]));
    return {
      workplaceId,
      recipientName: detail.person.name,
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
  }, [detail, history, shareFields, workplaceId]);
  const shareable = useMemo(
    () => (shareInput ? createPeopleShareable(shareInput) : null),
    [shareInput],
  );
  const sharePreview = useMemo(
    () => (shareInput ? buildPersonShareSummary(shareInput) : ''),
    [shareInput],
  );
  const share = useShareable(shareable);

  const foreignCurrencies = useMemo(() => {
    if (!detail) return [];
    const currencies = detail.balanceSummary.currencies
      .filter(c => c.currencyCode !== defaultCurrencyCode && (c.owedToYou > 0 || c.youOwe > 0))
      .map(c => c.currencyCode);
    return [...new Set(currencies)];
  }, [defaultCurrencyCode, detail]);

  const settledPreview = useMemo(() => {
    if (!detail) return null;
    const negative = detail.linkedAccounts.find(
      a => a.unassignedState.hasNegativeUnassignedRemainder,
    );
    if (negative) {
      return {
        closingResidual: 0,
        forgivenAccountName: `Forgiven ${detail.person.name}`,
        forgivenAccountType: 'Expense' as const,
        blockedReason: `${negative.account.name} has a negative unassigned remainder`,
      };
    }
    const roles = new Map<string, 'receivable' | 'payable'>();
    const precisionByCurrency = new Map<string, number>([
      [defaultCurrencyCode, getCurrencyPrecision(defaultCurrencyCode)],
    ]);
    for (const linked of detail.linkedAccounts) {
      precisionByCurrency.set(
        linked.account.currencyCode,
        getCurrencyPrecision(linked.account.currencyCode),
      );
      if (linked.account.accountType === AccountType.ASSET)
        roles.set(linked.account.id, 'receivable');
      else if (linked.account.accountType === AccountType.LIABILITY)
        roles.set(linked.account.id, 'payable');
    }
    const rateMap = new Map<string, number>();
    for (const currency of foreignCurrencies) {
      const parsed = Number(fxRatesDraft[currency] ?? '');
      if (Number.isFinite(parsed) && parsed > 0) rateMap.set(currency, parsed);
    }
    try {
      const plan = planWeAreSettled({
        accounts: detail.linkedAccounts.map(a => a.unassignedState),
        items: detail.openItems.map(o => o.item),
        activeAllocations: detail.activeAllocations.map(a => ({
          id: a.id,
          openItemId: a.openItemId,
          journalId: a.settlementJournalId,
          amount: a.amount,
          active: a.isActive,
        })),
        roles,
        workplaceCurrency: defaultCurrencyCode,
        expenseAccountId: '__pending_expense__' as AccountId,
        incomeAccountId: '__pending_income__' as AccountId,
        precisionByCurrency,
        exchangeRateByCurrency: rateMap,
      });
      const residualExpense = plan.lines.find(l => l.accountId === '__pending_expense__');
      const residualIncome = plan.lines.find(l => l.accountId === '__pending_income__');
      const closingResidual = residualExpense?.amount ?? residualIncome?.amount ?? 0;
      return {
        closingResidual,
        plan,
        forgivenAccountName: residualIncome
          ? `${detail.person.name} (Income)`
          : `${detail.person.name} (Expense)`,
        forgivenAccountType: (residualIncome ? 'Income' : 'Expense') as 'Expense' | 'Income',
        blockedReason: plan.lines.length < 2 ? 'Nothing open to close' : undefined,
      };
    } catch (error) {
      return {
        closingResidual: 0,
        forgivenAccountName: `${detail.person.name} (Expense)`,
        forgivenAccountType: 'Expense' as const,
        blockedReason: error instanceof Error ? error.message : 'Cannot preview settlement',
      };
    }
  }, [defaultCurrencyCode, detail, foreignCurrencies, fxRatesDraft]);

  const handleRename = useCallback(async () => {
    if (!detail) return;
    try {
      await renamePerson(workplaceId, detail.person.id, renameDraft);
      setRenameOpen(false);
      toast.success('Updated person name.');
      await load();
    } catch (error) {
      showErrorAlert(error instanceof Error ? error.message : 'Could not rename person');
    }
  }, [detail, load, renameDraft, workplaceId]);

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

  const handleStartWeAreSettled = useCallback(() => {
    if (!detail) return;
    if (foreignCurrencies.length > 0) {
      setSettledFxOpen(true);
    } else {
      setSettledPreviewOpen(true);
    }
  }, [detail, foreignCurrencies]);

  const handleConfirmWeAreSettled = useCallback(async () => {
    if (!detail || !settledPreview?.plan || settledPreview.blockedReason) return;
    const rateMap = new Map<string, number>();
    for (const currency of foreignCurrencies) {
      const parsed = Number(fxRatesDraft[currency]);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        showErrorAlert(`Enter a valid exchange rate for ${currency}`);
        return;
      }
      rateMap.set(currency, parsed);
    }
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
    }
  }, [
    defaultCurrencyCode,
    detail,
    foreignCurrencies,
    fxRatesDraft,
    load,
    settledPreview,
    workplaceId,
  ]);

  return {
    personId,
    workplaceCurrency: defaultCurrencyCode,
    detail,
    history,
    linkableAccounts,
    isLoading,
    foreignCurrencies,
    settledPreview,
    renameOpen,
    setRenameOpen,
    renameDraft,
    setRenameDraft,
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
    onOpenJournal: (journalId: JournalId) => AppNavigation.toJournalDetails(journalId),
    onRename: handleRename,
    onToggleArchive: handleToggleArchive,
    onLinkAccount: handleLinkAccount,
    onApplyUnassigned: handleApplyUnassigned,
    onStartWeAreSettled: handleStartWeAreSettled,
    onConfirmWeAreSettled: handleConfirmWeAreSettled,
    onShare: () => setSharePreviewOpen(true),
    onConfirmShare: share.share,
  };
}
