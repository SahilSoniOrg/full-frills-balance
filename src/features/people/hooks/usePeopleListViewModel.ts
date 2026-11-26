import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { useObservable } from '@/src/hooks/useObservable';
import { peopleReadService } from '@/src/services/people/peopleReadService';
import { createPerson, linkExistingAccount } from '@/src/services/people';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import type { PersonId, AccountId } from '@/src/types/ids';

export type PeopleListEntry = Awaited<
  ReturnType<typeof peopleReadService.listPeopleWithBalances>
>[number];
export type LinkableAccount = Awaited<
  ReturnType<typeof peopleReadService.listLinkableAccountsForPeople>
>[number];

export function usePeopleListViewModel() {
  const { workplaceId, defaultCurrencyCode } = useWorkplace();
  const params = useLocalSearchParams<{ create?: string }>();
  const [people, setPeople] = useState<PeopleListEntry[]>([]);
  const [accounts, setAccounts] = useState<LinkableAccount[]>([]);
  const [query, setQuery] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [modal, setModal] = useState<'create' | 'link' | null>(
    params.create === '1' ? 'create' : null,
  );
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
        includeArchived,
      }),
      peopleReadService.listLinkableAccountsForPeople(workplaceId),
    ]);
    setPeople(rows);
    setAccounts(linkable);
  }, [workplaceId, defaultCurrencyCode, includeArchived]);
  useEffect(() => {
    const timer = setTimeout(() => void reload(), 0);
    return () => clearTimeout(timer);
  }, [reload, tick, observation.version]);

  const filteredPeople = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return people.filter(row => row.person.name.toLocaleLowerCase().includes(normalized));
  }, [people, query]);
  const closeModal = () => setModal(null);
  const openCreate = () => {
    setPersonName('');
    setModal('create');
  };
  const openLink = () => {
    setPersonName('');
    setSelectedPersonId('');
    setSelectedAccountId('');
    setModal('link');
  };
  const addPerson = async () => {
    if (!personName.trim()) return;
    setBusy(true);
    try {
      await createPerson(workplaceId, { name: personName.trim() });
      closeModal();
      setTick(value => value + 1);
    } finally {
      setBusy(false);
    }
  };
  const linkAccount = async (personId?: PersonId) => {
    if (!selectedAccountId) return;
    setBusy(true);
    try {
      let targetId = personId ?? (selectedPersonId || undefined);
      if (!targetId && personName.trim())
        targetId = (await createPerson(workplaceId, { name: personName.trim() })).id;
      if (!targetId) return;
      await linkExistingAccount(workplaceId, targetId, selectedAccountId);
      closeModal();
      setTick(value => value + 1);
    } finally {
      setBusy(false);
    }
  };
  return {
    people: filteredPeople,
    accounts,
    query,
    setQuery,
    includeArchived,
    setIncludeArchived,
    modal,
    setModal,
    closeModal,
    openCreate,
    openLink,
    personName,
    setPersonName,
    selectedPersonId,
    setSelectedPersonId,
    selectedAccountId,
    setSelectedAccountId,
    busy,
    addPerson,
    linkAccount,
    reload: () => setTick(value => value + 1),
  };
}
