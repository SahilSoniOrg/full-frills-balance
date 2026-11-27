import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { useObservable } from '@/src/hooks/useObservable';
import { createPerson, linkExistingAccount, peopleReadService } from '@/src/services/people';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PersonId, AccountId } from '@/src/types/ids';

export type PeopleListEntry = Awaited<
  ReturnType<typeof peopleReadService.listPeopleWithBalances>
>[number];
export type LinkableAccount = Awaited<
  ReturnType<typeof peopleReadService.listLinkableAccountsForPeople>
>[number];

export function usePeopleListViewModel() {
  const { workplaceId, defaultCurrencyCode } = useWorkplace();
  const [people, setPeople] = useState<PeopleListEntry[]>([]);
  const [accounts, setAccounts] = useState<LinkableAccount[]>([]);
  const [query, setQuery] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [modal, setModal] = useState<'link' | null>(null);
  const [personName, setPersonName] = useState('');
  const [selectedPersonId, setSelectedPersonId] = useState<PersonId | ''>('');
  const [selectedAccountId, setSelectedAccountId] = useState<AccountId | ''>('');
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const observation = useObservable(
    () => peopleReadService.observePeopleTick(workplaceId),
    [workplaceId],
    null,
  );

  const reload = useCallback(async () => {
    const [rows, linkable] = await Promise.all([
      peopleReadService.listPeopleWithBalances(workplaceId, defaultCurrencyCode, {
        includeArchived: true,
      }),
      peopleReadService.listLinkableAccountsForPeople(workplaceId),
    ]);
    setPeople(rows);
    setAccounts(linkable);
  }, [workplaceId, defaultCurrencyCode]);
  useEffect(() => {
    const timer = setTimeout(() => void reload(), 0);
    return () => clearTimeout(timer);
  }, [reload, tick, observation.version]);

  const activePeople = useMemo(() => people.filter(row => !row.person.archivedAt), [people]);
  const hasArchivedPeople = useMemo(
    () => people.some(row => Boolean(row.person.archivedAt)),
    [people],
  );
  const visiblePeople = useMemo(
    () => (includeArchived ? people : activePeople),
    [activePeople, includeArchived, people],
  );
  const filteredPeople = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return visiblePeople.filter(row => row.person.name.toLocaleLowerCase().includes(normalized));
  }, [visiblePeople, query]);
  const activePeopleCount = activePeople.length;
  const balanceTotals = useMemo(() => {
    const owedToYou = new Map<string, number>();
    const youOwe = new Map<string, number>();
    for (const row of activePeople) {
      for (const currency of row.currencies) {
        if (currency.owedToYou > 0)
          owedToYou.set(
            currency.currencyCode,
            (owedToYou.get(currency.currencyCode) ?? 0) + currency.owedToYou,
          );
        if (currency.youOwe > 0)
          youOwe.set(
            currency.currencyCode,
            (youOwe.get(currency.currencyCode) ?? 0) + currency.youOwe,
          );
      }
    }
    return { owedToYou: [...owedToYou], youOwe: [...youOwe] };
  }, [activePeople]);
  const closeModal = () => {
    setModal(null);
    setPersonName('');
  };
  const openLink = () => {
    setPersonName('');
    setSelectedPersonId('');
    setSelectedAccountId('');
    setModal('link');
  };
  const selectPersonForLink = (personId: PersonId) => {
    setSelectedPersonId(current => {
      const next = current === personId ? '' : personId;
      if (next) setPersonName('');
      return next;
    });
  };
  const linkAccount = async (personId?: PersonId): Promise<boolean> => {
    if (!selectedAccountId) return false;
    setBusy(true);
    try {
      let targetId = personId ?? (selectedPersonId || undefined);
      if (!targetId && personName.trim())
        targetId = (await createPerson(workplaceId, { name: personName.trim() })).id;
      if (!targetId) return false;
      await linkExistingAccount(workplaceId, targetId, selectedAccountId);
      closeModal();
      setTick(value => value + 1);
      return true;
    } finally {
      setBusy(false);
    }
  };
  return {
    defaultCurrencyCode,
    people: filteredPeople,
    activePeopleCount,
    hasArchivedPeople,
    balanceTotals,
    accounts,
    query,
    setQuery,
    includeArchived,
    setIncludeArchived,
    modal,
    closeModal,
    openLink,
    personName,
    setPersonName,
    selectedPersonId,
    setSelectedPersonId,
    selectPersonForLink,
    selectedAccountId,
    setSelectedAccountId,
    busy,
    linkAccount,
    reload: () => setTick(value => value + 1),
  };
}
