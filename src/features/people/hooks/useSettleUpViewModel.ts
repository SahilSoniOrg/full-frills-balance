import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { getCurrencyPrecision } from '@/src/domain/money/currencyPrecision';
import { fromMinorUnits, toMinorUnits } from '@/src/domain/money/money';
import { AppNavigation } from '@/src/navigation/AppNavigation';
import { showErrorAlert, toast } from '@/src/services/feedback/alerts';
import { peopleReadService, recordRepayment } from '@/src/services/people';
import { AccountType } from '@/src/types/enums';
import type { AccountId, JournalId, OpenItemId, PersonId } from '@/src/types/ids';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';

type PersonDetailData = Awaited<ReturnType<typeof peopleReadService.getPersonDetail>>;
type SelectableAccount = Awaited<
  ReturnType<typeof peopleReadService.listSelectableAccounts>
>[number];
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
  const [accounts, setAccounts] = useState<SelectableAccount[]>([]);
  const [compatibleJournals, setCompatibleJournals] = useState<CompatibleJournal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [mode, setMode] = useState<'new' | 'match'>('new');
  const [targetAccountId, setTargetAccountId] = useState<AccountId | undefined>();
  const [cashAccountId, setCashAccountId] = useState<AccountId | undefined>();
  const [selectedExistingJournalId, setSelectedExistingJournalId] = useState<
    JournalId | undefined
  >();
  const [amountText, setAmountText] = useState('');
  const [exchangeRateText, setExchangeRateText] = useState('1');
  const [description, setDescription] = useState('Repayment');
  const [selectedItemIds, setSelectedItemIds] = useState<Record<string, boolean>>({});
  const [journalDate, setJournalDate] = useState(() => Date.now());
  const [journalCurrency, setJournalCurrency] = useState(defaultCurrencyCode);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!personId) {
        if (active) setIsLoading(false);
        return;
      }
      try {
        const [nextDetail, nextAccounts, nextCompatible] = await Promise.all([
          peopleReadService.getPersonDetail(workplaceId, personId, defaultCurrencyCode),
          peopleReadService.listSelectableAccounts(workplaceId),
          peopleReadService.listCompatibleRepaymentJournals(workplaceId, personId),
        ]);
        if (!active) return;
        setDetail(nextDetail);
        setAccounts(nextAccounts);
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

        const personAccountIds = new Set(nextDetail?.linkedAccounts.map(l => l.account.id) ?? []);
        const defaultCash = nextAccounts.find(
          a =>
            !personAccountIds.has(a.id) &&
            (a.accountType === AccountType.ASSET || a.accountType === AccountType.LIABILITY),
        );
        setCashAccountId(defaultCash?.id);
        setJournalCurrency(defaultCash?.currencyCode ?? defaultCurrencyCode);
        if (preItem && preItem.remainder > 0) {
          setSelectedItemIds({ [preItem.item.id]: true });
          setAmountText(String(preItem.remainder));
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
  const cashAccount = useMemo(
    () => accounts.find(a => a.id === cashAccountId),
    [accounts, cashAccountId],
  );
  const cashAccounts = useMemo(() => {
    const linkedIds = new Set(detail?.linkedAccounts.map(l => l.account.id) ?? []);
    return accounts.filter(
      a =>
        !linkedIds.has(a.id) &&
        (a.accountType === AccountType.ASSET || a.accountType === AccountType.LIABILITY),
    );
  }, [accounts, detail]);

  const targetOpenItems = useMemo(
    () =>
      (detail?.openItems ?? []).filter(
        entry => entry.remainder > 0 && entry.item.accountId === targetAccountId,
      ),
    [detail, targetAccountId],
  );

  const isCrossCurrency = Boolean(
    targetAccount &&
    journalCurrency &&
    targetAccount.currencyCode.toUpperCase() !== journalCurrency.toUpperCase(),
  );

  const toggleOpenItem = useCallback((id: OpenItemId) => {
    setSelectedItemIds(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const selectMatchedJournal = useCallback((journal: CompatibleJournal) => {
    setSelectedExistingJournalId(journal.journalId);
    setCashAccountId(journal.cashAccountId);
    setAmountText(String(journal.cashAmount));
    setJournalDate(journal.journalDate);
    setJournalCurrency(journal.currencyCode);
    if (journal.description) setDescription(journal.description);
  }, []);

  const handleSelectCashAccount = useCallback(
    (id: AccountId) => {
      setCashAccountId(id);
      const found = accounts.find(a => a.id === id);
      if (found) setJournalCurrency(found.currencyCode);
    },
    [accounts],
  );

  const handleSubmit = useCallback(async () => {
    if (!detail || !targetAccount || !cashAccountId) {
      showErrorAlert('Select both a person account and a cash/bank account');
      return;
    }
    const cashAmount = Number(amountText);
    if (!Number.isFinite(cashAmount) || cashAmount <= 0) {
      showErrorAlert('Enter a positive repayment amount');
      return;
    }

    const rate = isCrossCurrency ? Number(exchangeRateText) : 1;
    if (isCrossCurrency && (!Number.isFinite(rate) || rate <= 0)) {
      showErrorAlert('Enter a positive exchange rate');
      return;
    }

    const targetPrecision = getCurrencyPrecision(targetAccount.currencyCode);
    const targetEquivalent = isCrossCurrency
      ? fromMinorUnits(toMinorUnits(cashAmount / rate, targetPrecision), targetPrecision)
      : cashAmount;
    let remainingUnits = toMinorUnits(targetEquivalent, targetPrecision);
    const allocations: { openItemId: OpenItemId; amount: number }[] = [];

    for (const entry of targetOpenItems) {
      if (!selectedItemIds[entry.item.id] || remainingUnits <= 0) continue;
      const itemUnits = toMinorUnits(entry.remainder, targetPrecision);
      const applyUnits = Math.min(remainingUnits, itemUnits);
      if (applyUnits > 0) {
        allocations.push({
          openItemId: entry.item.id,
          amount: fromMinorUnits(applyUnits, targetPrecision),
        });
        remainingUnits -= applyUnits;
      }
    }

    const unassignedAmount = isCrossCurrency ? 0 : fromMinorUnits(remainingUnits, targetPrecision);

    setIsSubmitting(true);
    try {
      await recordRepayment(workplaceId, {
        personId: detail.person.id,
        targetAccountId: targetAccount.id,
        cashAccountId,
        cashAmount,
        journalDate,
        journalCurrency,
        description: description.trim() || 'Repayment',
        ...(mode === 'match' && selectedExistingJournalId
          ? { existingJournalId: selectedExistingJournalId }
          : {}),
        allocations,
        unassignedAmount,
        ...(isCrossCurrency
          ? { exchangeRate: rate, targetAmount: allocations[0]?.amount ?? targetEquivalent }
          : {}),
      });
      toast.success('Repayment recorded.');
      AppNavigation.back();
    } catch (error) {
      showErrorAlert(error instanceof Error ? error.message : 'Could not record repayment');
    } finally {
      setIsSubmitting(false);
    }
  }, [
    amountText,
    cashAccountId,
    description,
    detail,
    exchangeRateText,
    isCrossCurrency,
    journalCurrency,
    journalDate,
    mode,
    selectedExistingJournalId,
    selectedItemIds,
    targetAccount,
    targetOpenItems,
    workplaceId,
  ]);

  return {
    isLoading,
    isSubmitting,
    detail,
    mode,
    setMode,
    targetAccountId,
    setTargetAccountId,
    cashAccountId,
    cashAccount,
    cashAccounts,
    targetAccount,
    targetOpenItems,
    compatibleJournals,
    selectedExistingJournalId,
    selectMatchedJournal,
    handleSelectCashAccount,
    amountText,
    setAmountText,
    exchangeRateText,
    setExchangeRateText,
    description,
    setDescription,
    journalCurrency,
    isCrossCurrency,
    selectedItemIds,
    toggleOpenItem,
    onSubmit: handleSubmit,
    onBack: AppNavigation.back,
  };
}
