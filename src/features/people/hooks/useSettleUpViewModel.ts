import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { AppNavigation } from '@/src/navigation/AppNavigation';
import { showErrorAlert, toast } from '@/src/services/feedback/alerts';
import { peopleReadService, recordRepayment } from '@/src/services/people';
import { AccountType } from '@/src/types/enums';
import { getCurrencyPrecision } from '@/src/domain/money/currencyPrecision';
import { fromMinorUnits, toMinorUnits } from '@/src/domain/money/money';
import type { AccountId, JournalId, OpenItemId, PersonId } from '@/src/types/ids';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';

type PersonDetailData = Awaited<ReturnType<typeof peopleReadService.getPersonDetail>>;
type CompatibleJournal = Awaited<
  ReturnType<typeof peopleReadService.listCompatibleRepaymentJournals>
>[number];

export function useSettleUpViewModel() {
  const { personId, openItemId } = useLocalSearchParams<{
    personId: PersonId;
    openItemId?: OpenItemId;
  }>();
  const { workplaceId, defaultCurrencyCode } = useWorkplace();
  const [detail, setDetail] = useState<PersonDetailData>(null);
  const [compatibleJournals, setCompatibleJournals] = useState<CompatibleJournal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [targetAccountId, setTargetAccountId] = useState<AccountId | undefined>();
  const [selectedExistingJournalId, setSelectedExistingJournalId] = useState<
    JournalId | undefined
  >();
  const [selectedItemIds, setSelectedItemIds] = useState<Record<string, boolean>>({});
  const [allocationDrafts, setAllocationDrafts] = useState<Record<string, string>>({});
  const [exchangeRate, setExchangeRate] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      if (!personId) {
        if (active) setIsLoading(false);
        return;
      }
      try {
        const [nextDetail, nextCompatible] = await Promise.all([
          peopleReadService.getPersonDetail(workplaceId, personId, defaultCurrencyCode),
          peopleReadService.listCompatibleRepaymentJournals(workplaceId, personId),
        ]);
        if (!active) return;
        setDetail(nextDetail);
        setCompatibleJournals(nextCompatible);

        const debtLinks =
          nextDetail?.linkedAccounts.filter(
            linked =>
              linked.account.accountType === AccountType.ASSET ||
              linked.account.accountType === AccountType.LIABILITY,
          ) ?? [];
        const preItem = openItemId
          ? nextDetail?.openItems.find(o => o.item.id === openItemId)
          : undefined;
        const defaultTarget =
          preItem?.item.accountId ??
          debtLinks.find(l => l.unassignedState.ledgerBalanceInNormalDirection > 0)?.account.id ??
          debtLinks[0]?.account.id;
        setTargetAccountId(defaultTarget);

        if (preItem && preItem.remainder > 0) {
          setSelectedItemIds({ [preItem.item.id]: true });
        }
      } finally {
        if (active) setIsLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [defaultCurrencyCode, openItemId, personId, workplaceId]);

  const targetAccount = useMemo(
    () => detail?.linkedAccounts.find(l => l.account.id === targetAccountId)?.account,
    [detail, targetAccountId],
  );
  const targetOpenItems = useMemo(
    () =>
      (detail?.openItems ?? []).filter(
        entry => entry.remainder > 0 && entry.item.accountId === targetAccountId,
      ),
    [detail, targetAccountId],
  );

  const toggleOpenItem = useCallback((id: OpenItemId) => {
    setSelectedItemIds(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const selectMatchedJournal = useCallback((journal: CompatibleJournal) => {
    setSelectedExistingJournalId(journal.journalId);
  }, []);
  const selectedJournal = compatibleJournals.find(
    item => item.journalId === selectedExistingJournalId,
  );
  const isCrossCurrency = Boolean(
    selectedJournal && targetAccount && selectedJournal.currencyCode !== targetAccount.currencyCode,
  );
  const repaymentPreview = useMemo(() => {
    if (!selectedJournal || !targetAccount) return null;
    const rate = isCrossCurrency ? Number(exchangeRate) : 1;
    if (!Number.isFinite(rate) || rate <= 0) return null;
    const precision = getCurrencyPrecision(targetAccount.currencyCode);
    let remaining = toMinorUnits(selectedJournal.cashAmount / rate, precision);
    const allocations: { openItemId: OpenItemId; amount: number }[] = [];
    for (const entry of targetOpenItems) {
      if (!selectedItemIds[entry.item.id]) continue;
      const draft = allocationDrafts[entry.item.id]?.trim();
      const amount = draft
        ? toMinorUnits(Number(draft), precision)
        : Math.min(remaining, toMinorUnits(entry.remainder, precision));
      if (
        !Number.isFinite(amount) ||
        amount < 0 ||
        (draft && amount === 0) ||
        amount > remaining ||
        amount > toMinorUnits(entry.remainder, precision)
      )
        return null;
      if (amount > 0)
        allocations.push({ openItemId: entry.item.id, amount: fromMinorUnits(amount, precision) });
      remaining -= amount;
    }
    return {
      rate,
      allocations,
      unassignedAmount: fromMinorUnits(remaining, precision),
      amount: fromMinorUnits(toMinorUnits(selectedJournal.cashAmount / rate, precision), precision),
    };
  }, [
    allocationDrafts,
    exchangeRate,
    isCrossCurrency,
    selectedItemIds,
    selectedJournal,
    targetAccount,
    targetOpenItems,
  ]);

  const handleSubmit = useCallback(async () => {
    const journal = compatibleJournals.find(item => item.journalId === selectedExistingJournalId);
    if (!detail || !targetAccount || !journal) {
      showErrorAlert('Select an existing repayment and a person account');
      return;
    }
    if (!repaymentPreview) {
      showErrorAlert('Check the exchange rate and selected allocation amounts');
      return;
    }
    const { rate, allocations, unassignedAmount } = repaymentPreview;
    if (isCrossCurrency && (allocations.length === 0 || unassignedAmount !== 0)) {
      showErrorAlert('Select open items that cover the converted repayment');
      return;
    }
    setIsSubmitting(true);
    try {
      await recordRepayment(workplaceId, {
        personId: detail.person.id,
        targetAccountId: targetAccount.id,
        cashAccountId: journal.cashAccountId,
        cashAmount: journal.cashAmount,
        journalDate: journal.journalDate,
        journalCurrency: journal.currencyCode,
        description: journal.description || 'Repayment',
        existingJournalId: journal.journalId,
        expectedJournalUpdatedAt: journal.journalUpdatedAt,
        allocations,
        unassignedAmount,
        ...(isCrossCurrency ? { exchangeRate: rate, targetAmount: repaymentPreview.amount } : {}),
      });
      toast.success('Repayment recorded.');
      AppNavigation.back();
    } catch (error) {
      showErrorAlert(error instanceof Error ? error.message : 'Could not record repayment');
    } finally {
      setIsSubmitting(false);
    }
  }, [
    compatibleJournals,
    detail,
    selectedExistingJournalId,
    targetAccount,
    isCrossCurrency,
    repaymentPreview,
    workplaceId,
  ]);

  return {
    isLoading,
    isSubmitting,
    detail,
    workplaceId,
    targetAccountId,
    setTargetAccountId,
    targetAccount,
    targetOpenItems,
    isCrossCurrency,
    repaymentPreview,
    exchangeRate,
    setExchangeRate,
    allocationDrafts,
    setAllocationDrafts,
    compatibleJournals,
    selectedExistingJournalId,
    selectMatchedJournal,
    recordNewRepayment: () => AppNavigation.toSimpleJournalEntry('transfer', { workplaceId }),
    selectedItemIds,
    toggleOpenItem,
    onSubmit: handleSubmit,
    onBack: AppNavigation.back,
  };
}
