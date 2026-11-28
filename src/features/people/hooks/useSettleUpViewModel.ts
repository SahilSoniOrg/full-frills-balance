import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { AppNavigation } from '@/src/navigation/AppNavigation';
import { showErrorAlert, toast } from '@/src/services/feedback/alerts';
import { peopleReadService, recordRepayment } from '@/src/services/people';
import { AccountType } from '@/src/types/enums';
import { parsePositiveRate } from '@/src/domain/accounting/parsePositiveRate';
import { getCurrencyPrecision } from '@/src/domain/money/currencyPrecision';
import { fromMinorUnits, toMinorUnits } from '@/src/domain/money/money';
import { allocatePersonRepaymentMinorUnits } from '@/src/domain/people/personRepaymentAllocation';
import { matchRepaymentAmount } from '@/src/domain/people/personRepaymentPolicy';
import { parseSimpleAmountInput } from '@/src/services/journal/simpleJournalHelpers';
import type { AccountId, OpenItemId, PersonId } from '@/src/types/ids';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';

type PersonDetailData = Awaited<ReturnType<typeof peopleReadService.getPersonDetail>>;
type MatchPage = Awaited<ReturnType<typeof peopleReadService.listCompatibleRepaymentJournals>>;
type CompatibleJournal = MatchPage['matches'][number];

export function useSettleUpViewModel() {
  const { personId, openItemId } = useLocalSearchParams<{
    personId: PersonId;
    openItemId?: OpenItemId;
  }>();
  const { workplaceId, defaultCurrencyCode } = useWorkplace();
  const [detail, setDetail] = useState<PersonDetailData>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [targetAccountId, setTargetAccountId] = useState<AccountId>();
  const [selectedJournal, setSelectedJournal] = useState<CompatibleJournal>();
  const [selectedItemIds, setSelectedItemIds] = useState<Record<string, boolean>>({});
  const [allocationDrafts, setAllocationDrafts] = useState<Record<string, string>>({});
  const [exchangeRate, setExchangeRate] = useState('');
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<CompatibleJournal[]>([]);
  const [matchPage, setMatchPage] = useState<MatchPage>();
  const [isLoadingMatches, setIsLoadingMatches] = useState(false);
  const matchRequest = useRef(0);

  useEffect(() => {
    let active = true;
    // Clear the previous person's selection when the request scope changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDetail(null);
    setTargetAccountId(undefined);
    setSelectedJournal(undefined);
    setSelectedItemIds({});
    setAllocationDrafts({});
    setExchangeRate('');
    if (!personId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    void peopleReadService
      .getPersonDetail(workplaceId, personId, defaultCurrencyCode)
      .then(next => {
        if (!active) return;
        setDetail(next);
        const item = next?.openItems.find(row => row.item.id === openItemId);
        const debtLinks =
          next?.linkedAccounts.filter(
            ({ account }) =>
              account.accountType === AccountType.ASSET ||
              account.accountType === AccountType.LIABILITY,
          ) ?? [];
        setTargetAccountId(
          item?.item.accountId ??
            debtLinks.find(link => link.unassignedState.ledgerBalanceInNormalDirection > 0)?.account
              .id ??
            debtLinks[0]?.account.id,
        );
        if (item && item.remainder > 0) setSelectedItemIds({ [item.item.id]: true });
      })
      .catch(error => {
        if (active)
          showErrorAlert(error instanceof Error ? error.message : 'Could not load person');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [defaultCurrencyCode, openItemId, personId, workplaceId]);

  async function loadMatches(token: number, previous?: MatchPage) {
    setIsLoadingMatches(true);
    try {
      const page = await peopleReadService.listCompatibleRepaymentJournals(workplaceId, personId, {
        query,
        cursor: previous?.nextCursor,
        createdBefore: previous?.createdBefore,
      });
      if (token !== matchRequest.current) return;
      setMatches(current => (previous ? [...current, ...page.matches] : page.matches));
      setMatchPage(page);
    } catch (error) {
      if (token === matchRequest.current) {
        showErrorAlert(error instanceof Error ? error.message : 'Could not load repayments');
      }
    } finally {
      if (token === matchRequest.current) setIsLoadingMatches(false);
    }
  }

  useEffect(() => {
    if (!personId) return;
    const token = ++matchRequest.current;
    // Clear results from the preceding search while the new request is pending.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMatches([]);
    setMatchPage(undefined);
    setIsLoadingMatches(true);
    const timer = setTimeout(() => void loadMatches(token), query ? 150 : 0);
    return () => {
      clearTimeout(timer);
      matchRequest.current += 1;
    };
    // Each new search starts at the first page of the current scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personId, query, workplaceId]);

  const debtAccounts =
    detail?.linkedAccounts.filter(
      ({ account }) =>
        (account.accountType === AccountType.ASSET ||
          account.accountType === AccountType.LIABILITY) &&
        (!selectedJournal || selectedJournal.targetAccountIds.includes(account.id)),
    ) ?? [];
  const targetAccount = debtAccounts.find(row => row.account.id === targetAccountId)?.account;
  const targetOpenItems = useMemo(
    () =>
      (detail?.openItems ?? []).filter(
        row => row.remainder > 0 && row.item.accountId === targetAccountId,
      ),
    [detail, targetAccountId],
  );

  function selectTargetAccount(accountId: AccountId) {
    if (accountId === targetAccountId) return;
    setTargetAccountId(accountId);
    setSelectedItemIds({});
    setAllocationDrafts({});
    setExchangeRate('');
  }

  function selectMatchedJournal(journal: CompatibleJournal) {
    setSelectedJournal(journal);
    if (!targetAccountId || !journal.targetAccountIds.includes(targetAccountId)) {
      selectTargetAccount(journal.targetAccountIds[0]);
    }
  }

  const isCrossCurrency = Boolean(
    selectedJournal && targetAccount && selectedJournal.currencyCode !== targetAccount.currencyCode,
  );
  const rate = isCrossCurrency ? parsePositiveRate(exchangeRate) : 1;
  const repaymentPreview = useMemo(() => {
    if (!selectedJournal || !targetAccount || rate === null) return null;
    const precision =
      detail?.precisionByCurrency?.get(targetAccount.currencyCode) ??
      getCurrencyPrecision(targetAccount.currencyCode);
    const journalPrecision =
      detail?.precisionByCurrency?.get(selectedJournal.currencyCode) ??
      getCurrencyPrecision(selectedJournal.currencyCode);
    const amount = matchRepaymentAmount(selectedJournal.journalAmount, rate, precision);
    const journalUnits = toMinorUnits(selectedJournal.journalAmount, journalPrecision);
    if (amount <= 0 || toMinorUnits(amount * rate, journalPrecision) !== journalUnits) return null;

    const amountMinor = toMinorUnits(amount, precision);
    const candidates = targetOpenItems
      .filter(row => selectedItemIds[row.item.id])
      .map(({ item, remainder }) => ({
        openItemId: item.id,
        id: item.id,
        availableMinor: toMinorUnits(remainder, precision),
        journalDate: item.journalDate ?? item.createdAt ?? 0,
        createdAt: item.createdAt ?? 0,
      }));
    const explicit = candidates.flatMap(item => {
      const draft = allocationDrafts[item.openItemId]?.trim();
      return draft
        ? [
            {
              openItemId: item.openItemId,
              amountMinor: toMinorUnits(parseSimpleAmountInput(draft), precision),
            },
          ]
        : [];
    });
    try {
      const assigned = allocatePersonRepaymentMinorUnits({
        amountMinor,
        items: candidates,
        requestedAllocations: explicit,
      });
      const assignedIds = new Set(explicit.map(row => row.openItemId));
      const automatic = allocatePersonRepaymentMinorUnits({
        amountMinor: assigned.unallocatedMinor,
        items: candidates.filter(item => !assignedIds.has(item.openItemId)),
      });
      return {
        rate,
        amount,
        unassignedAmount: fromMinorUnits(automatic.unallocatedMinor, precision),
        allocations: [...assigned.allocations, ...automatic.allocations].map(row => ({
          openItemId: row.openItemId,
          amount: fromMinorUnits(row.amountMinor, precision),
        })),
      };
    } catch {
      return null;
    }
  }, [
    allocationDrafts,
    detail,
    rate,
    selectedItemIds,
    selectedJournal,
    targetAccount,
    targetOpenItems,
  ]);

  const disabledReason = !selectedJournal
    ? 'Select an existing repayment'
    : !targetAccount
      ? 'Select a compatible person account'
      : !repaymentPreview
        ? 'Check the rate and the allocation amounts'
        : isCrossCurrency && repaymentPreview.unassignedAmount !== 0
          ? 'Allocate the full converted repayment'
          : null;

  async function handleSubmit() {
    if (
      disabledReason ||
      isSubmitting ||
      !detail ||
      !targetAccount ||
      !repaymentPreview ||
      !selectedJournal
    )
      return;
    setIsSubmitting(true);
    try {
      await recordRepayment(workplaceId, {
        personId: detail.person.id,
        targetAccountId: targetAccount.id,
        cashAccountId: selectedJournal.cashAccountId,
        cashAmount: selectedJournal.cashAmount,
        journalDate: selectedJournal.journalDate,
        journalCurrency: selectedJournal.currencyCode,
        existingJournalId: selectedJournal.journalId,
        expectedCurrent: selectedJournal.expectedCurrent,
        expectedJournalUpdatedAt: selectedJournal.journalUpdatedAt,
        allocations: repaymentPreview.allocations,
        unassignedAmount: repaymentPreview.unassignedAmount,
        ...(isCrossCurrency
          ? { exchangeRate: repaymentPreview.rate, targetAmount: repaymentPreview.amount }
          : {}),
      });
      toast.success('Repayment recorded.');
      AppNavigation.back();
    } catch (error) {
      showErrorAlert(error instanceof Error ? error.message : 'Could not record repayment');
    } finally {
      setIsSubmitting(false);
    }
  }

  return {
    isLoading,
    isSubmitting,
    detail,
    workplaceId,
    debtAccounts,
    targetAccountId,
    setTargetAccountId: selectTargetAccount,
    targetAccount,
    targetOpenItems,
    isCrossCurrency,
    repaymentPreview,
    exchangeRate,
    setExchangeRate,
    allocationDrafts,
    setAllocationDrafts,
    compatibleJournals: matches,
    selectedExistingJournalId: selectedJournal?.journalId,
    selectedJournalCandidateId: selectedJournal?.id,
    selectedJournal,
    selectMatchedJournal,
    disabledReason,
    query,
    setQuery,
    isLoadingMatches,
    hasMoreMatches: Boolean(matchPage?.nextCursor),
    onLoadMore: () => {
      if (matchPage?.nextCursor && !isLoadingMatches)
        void loadMatches(++matchRequest.current, matchPage);
    },
    recordNewRepayment: () =>
      AppNavigation.toTransferRepayment({ workplaceId, personId, openItemId }),
    selectedItemIds,
    toggleOpenItem: (id: OpenItemId) =>
      setSelectedItemIds(current => ({ ...current, [id]: !current[id] })),
    onSubmit: handleSubmit,
    onBack: AppNavigation.back,
  };
}
