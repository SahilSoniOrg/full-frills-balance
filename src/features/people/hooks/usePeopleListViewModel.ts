import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { useObservable } from '@/src/hooks/useObservable';
import { peopleReadService } from '@/src/services/people';
import { useEffect, useMemo, useState } from 'react';

export type PeopleListEntry = Awaited<
  ReturnType<typeof peopleReadService.listPeopleWithBalances>
>[number];

export function usePeopleListViewModel() {
  const { workplaceId, defaultCurrencyCode } = useWorkplace();
  const [peopleSnapshot, setPeopleSnapshot] = useState<{
    scope: string;
    rows: PeopleListEntry[];
  }>();
  const scope = JSON.stringify([workplaceId, defaultCurrencyCode]);
  const people = peopleSnapshot?.scope === scope ? peopleSnapshot.rows : [];
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [tick, setTick] = useState(0);
  const observation = useObservable(
    () => peopleReadService.observePeopleTick(workplaceId),
    [workplaceId],
    null,
  );

  useEffect(() => {
    let active = true;
    // Reset the external request state when its scope changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoading(true);
    setLoadError(null);
    void peopleReadService
      .listPeopleWithBalances(workplaceId, defaultCurrencyCode, {
        includeArchived: true,
      })
      .then(rows => {
        if (active) setPeopleSnapshot({ scope, rows });
      })
      .catch(error => {
        if (active) setLoadError(error instanceof Error ? error.message : 'Could not load people');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [scope, workplaceId, defaultCurrencyCode, tick, observation.version]);

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

  return {
    defaultCurrencyCode,
    people: filteredPeople,
    isLoading,
    loadError,
    activePeopleCount,
    hasArchivedPeople,
    balanceTotals,
    query,
    setQuery,
    includeArchived,
    setIncludeArchived,
    reload: () => setTick(value => value + 1),
  };
}
