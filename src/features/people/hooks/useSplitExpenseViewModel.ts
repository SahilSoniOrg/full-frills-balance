import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { customSplit, equalSplit } from '@/src/domain/people';
import { getCurrencyPrecision } from '@/src/domain/money/currencyPrecision';
import { fromMinorUnits, toMinorUnits } from '@/src/domain/money/money';
import { AppNavigation } from '@/src/navigation/AppNavigation';
import { showErrorAlert, toast } from '@/src/services/feedback/alerts';
import {
  createPerson,
  peopleReadService,
  saveFriendPaidBill,
  saveSplitExpense,
} from '@/src/services/people';
import { AccountType } from '@/src/types/enums';
import type { AccountId, JournalId, PersonId } from '@/src/types/ids';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';

type PersonRow = Awaited<ReturnType<typeof peopleReadService.listPeopleWithBalances>>[number];
type SelectableAccount = Awaited<
  ReturnType<typeof peopleReadService.listSelectableAccounts>
>[number];

export function useSplitExpenseViewModel() {
  const { journalId, personId: initialPersonId } = useLocalSearchParams<{
    journalId?: JournalId;
    personId?: PersonId;
  }>();
  const { workplaceId, defaultCurrencyCode } = useWorkplace();
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [accounts, setAccounts] = useState<SelectableAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [payerMode, setPayerMode] = useState<'you' | 'friend'>('you');
  const [friendPayerId, setFriendPayerId] = useState<PersonId | undefined>(initialPersonId);
  const [friendRepayable, setFriendRepayable] = useState(true);
  const [description, setDescription] = useState('');
  const [totalText, setTotalText] = useState('');
  const [userShareText, setUserShareText] = useState('');
  const [fundingAccountId, setFundingAccountId] = useState<AccountId | undefined>();
  const [expenseAccountId, setExpenseAccountId] = useState<AccountId | undefined>();
  const [currencyCode, setCurrencyCode] = useState(defaultCurrencyCode);
  const [journalDate, setJournalDate] = useState(() => Date.now());
  const [selectedPersonIds, setSelectedPersonIds] = useState<PersonId[]>(
    initialPersonId ? [initialPersonId] : [],
  );
  const [splitMethod, setSplitMethod] = useState<'equal' | 'custom'>('equal');
  const [customShares, setCustomShares] = useState<Record<string, string>>({});
  const [newPersonName, setNewPersonName] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [nextPeople, nextAccounts, existingSplit] = await Promise.all([
          peopleReadService.listPeopleWithBalances(workplaceId, defaultCurrencyCode, {
            includeArchived: false,
          }),
          peopleReadService.listSelectableAccounts(workplaceId),
          journalId
            ? peopleReadService.getJournalForSplit(workplaceId, journalId)
            : Promise.resolve(null),
        ]);
        if (!active) return;
        setPeople(nextPeople);
        setAccounts(nextAccounts);

        const defaultFunding = nextAccounts.find(
          a => a.accountType === AccountType.ASSET || a.accountType === AccountType.LIABILITY,
        );
        const defaultExpense = nextAccounts.find(a => a.accountType === AccountType.EXPENSE);

        if (existingSplit) {
          setDescription(existingSplit.journal.description ?? '');
          setTotalText(String(existingSplit.totalAmount));
          setCurrencyCode(existingSplit.journal.currencyCode);
          setJournalDate(existingSplit.journal.journalDate);

          const creditLine = existingSplit.lines.find(l => l.transactionType === 'CREDIT');
          const expenseLine = existingSplit.lines.find(l => l.accountType === AccountType.EXPENSE);
          setFundingAccountId(creditLine?.accountId ?? defaultFunding?.id);
          setExpenseAccountId(expenseLine?.accountId ?? defaultExpense?.id);

          if (existingSplit.participants.length > 0) {
            setSelectedPersonIds(existingSplit.participants.map(p => p.personId));
            setSplitMethod('custom');
            const draft: Record<string, string> = {};
            existingSplit.participants.forEach(p => {
              draft[p.personId] = String(p.amount);
            });
            setCustomShares(draft);
            setUserShareText(String(existingSplit.userShare));
          } else {
            setSplitMethod('equal');
          }
        } else {
          setFundingAccountId(defaultFunding?.id);
          setExpenseAccountId(defaultExpense?.id);
          if (defaultFunding) setCurrencyCode(defaultFunding.currencyCode);
          if (!friendPayerId && nextPeople[0]) setFriendPayerId(nextPeople[0].person.id);
        }
      } finally {
        if (active) setIsLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [defaultCurrencyCode, friendPayerId, journalId, workplaceId]);

  const fundingAccounts = useMemo(
    () =>
      accounts.filter(
        a => a.accountType === AccountType.ASSET || a.accountType === AccountType.LIABILITY,
      ),
    [accounts],
  );
  const expenseAccounts = useMemo(
    () => accounts.filter(a => a.accountType === AccountType.EXPENSE),
    [accounts],
  );

  const selectedPeople = useMemo(
    () => people.filter(p => selectedPersonIds.includes(p.person.id)),
    [people, selectedPersonIds],
  );

  const parsedTotal = Number(totalText);
  const splitPreview = useMemo(() => {
    if (!Number.isFinite(parsedTotal) || parsedTotal <= 0 || selectedPeople.length === 0) {
      return {
        valid: false,
        userShare: 0,
        shares: [] as { personId: PersonId; name: string; amount: number }[],
      };
    }
    try {
      if (splitMethod === 'equal') {
        const parts = equalSplit(parsedTotal, 1 + selectedPeople.length, currencyCode);
        return {
          valid: true,
          userShare: parts[0] ?? 0,
          shares: selectedPeople.map((entry, idx) => ({
            personId: entry.person.id,
            name: entry.person.name,
            amount: parts[idx + 1] ?? 0,
          })),
        };
      }
      const userVal = Number(userShareText || '0');
      const personVals = selectedPeople.map(entry => Number(customShares[entry.person.id] || '0'));
      if (![userVal, ...personVals].every(v => Number.isFinite(v) && v >= 0)) {
        return {
          valid: false,
          userShare: 0,
          shares: [] as { personId: PersonId; name: string; amount: number }[],
        };
      }
      const normalized = customSplit(parsedTotal, [userVal, ...personVals], currencyCode);
      return {
        valid: true,
        userShare: normalized[0] ?? 0,
        shares: selectedPeople.map((entry, idx) => ({
          personId: entry.person.id,
          name: entry.person.name,
          amount: normalized[idx + 1] ?? 0,
        })),
      };
    } catch {
      return {
        valid: false,
        userShare: 0,
        shares: [] as { personId: PersonId; name: string; amount: number }[],
      };
    }
  }, [currencyCode, customShares, parsedTotal, selectedPeople, splitMethod, userShareText]);

  const toggleParticipant = useCallback((personId: PersonId) => {
    setSelectedPersonIds(prev =>
      prev.includes(personId) ? prev.filter(id => id !== personId) : [...prev, personId],
    );
  }, []);

  const handleQuickAddPerson = useCallback(async () => {
    const trimmed = newPersonName.trim();
    if (!trimmed) return;
    try {
      const created = await createPerson(workplaceId, { name: trimmed });
      setNewPersonName('');
      const refreshed = await peopleReadService.listPeopleWithBalances(
        workplaceId,
        defaultCurrencyCode,
        { includeArchived: false },
      );
      setPeople(refreshed);
      setSelectedPersonIds(prev => (prev.includes(created.id) ? prev : [...prev, created.id]));
      setFriendPayerId(prev => prev ?? created.id);
    } catch (error) {
      showErrorAlert(error instanceof Error ? error.message : 'Could not add person');
    }
  }, [defaultCurrencyCode, newPersonName, workplaceId]);

  const handleSelectFundingAccount = useCallback(
    (id: AccountId) => {
      setFundingAccountId(id);
      const found = accounts.find(a => a.id === id);
      if (found) setCurrencyCode(found.currencyCode);
    },
    [accounts],
  );

  const handleSubmit = useCallback(async () => {
    if (!expenseAccountId) {
      showErrorAlert('Select an expense category account');
      return;
    }
    setIsSubmitting(true);
    try {
      if (payerMode === 'friend' && !journalId) {
        if (!friendPayerId) {
          showErrorAlert('Select who paid the bill');
          return;
        }
        const precision = getCurrencyPrecision(currencyCode);
        const share = Number(userShareText);
        if (!Number.isFinite(share) || toMinorUnits(share, precision) <= 0) {
          showErrorAlert('Enter your positive share of the bill');
          return;
        }
        await saveFriendPaidBill(workplaceId, {
          journalDate,
          description: description.trim() || 'Shared bill',
          currencyCode,
          expenseAccountId,
          payerPersonId: friendPayerId,
          userShare: fromMinorUnits(toMinorUnits(share, precision), precision),
          repayable: friendRepayable,
        });
      } else {
        if (!fundingAccountId) {
          showErrorAlert('Select a payment account');
          return;
        }
        if (!splitPreview.valid) {
          showErrorAlert('Ensure participant shares add up to total bill');
          return;
        }
        await saveSplitExpense(workplaceId, {
          ...(journalId ? { existingJournalId: journalId } : {}),
          journalDate,
          description: description.trim() || 'Split expense',
          currencyCode,
          fundingAccountId,
          expenseAccountId,
          userShare: splitPreview.userShare,
          participants: splitPreview.shares.map(share => ({
            personId: share.personId,
            amount: share.amount,
          })),
        });
      }
      toast.success('Split expense saved.');
      AppNavigation.back();
    } catch (error) {
      showErrorAlert(error instanceof Error ? error.message : 'Could not save split expense');
    } finally {
      setIsSubmitting(false);
    }
  }, [
    currencyCode,
    description,
    expenseAccountId,
    friendPayerId,
    friendRepayable,
    fundingAccountId,
    journalDate,
    journalId,
    payerMode,
    splitPreview,
    userShareText,
    workplaceId,
  ]);

  return {
    isEditingExisting: Boolean(journalId),
    isLoading,
    isSubmitting,
    people,
    fundingAccounts,
    expenseAccounts,
    payerMode,
    setPayerMode,
    friendPayerId,
    setFriendPayerId,
    friendRepayable,
    setFriendRepayable,
    description,
    setDescription,
    totalText,
    setTotalText,
    userShareText,
    setUserShareText,
    fundingAccountId,
    handleSelectFundingAccount,
    expenseAccountId,
    setExpenseAccountId,
    currencyCode,
    selectedPersonIds,
    toggleParticipant,
    splitMethod,
    setSplitMethod,
    customShares,
    setCustomShares,
    newPersonName,
    setNewPersonName,
    onQuickAddPerson: handleQuickAddPerson,
    splitPreview,
    parsedTotal: Number.isFinite(parsedTotal) ? parsedTotal : 0,
    onSubmit: handleSubmit,
    onBack: AppNavigation.back,
  };
}
