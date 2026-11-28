import { peopleStrings } from '@/src/constants/copy/domains/peopleStrings';
import { useEffectivePrivacyMode } from '@/src/contexts/PrivacyScope';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { useObservable } from '@/src/hooks/useObservable';
import { peopleReadService } from '@/src/services/people';
import { formatMoneyAmount } from '@/src/utils/currencyFormatter';
import { useEffect, useMemo, useState } from 'react';

export type PeopleListEntry = Awaited<
  ReturnType<typeof peopleReadService.listPeopleWithBalances>
>[number];

export type PeopleBalanceOverviewProps = {
  currencyCode: string;
  owedToYou: number;
  youOwe: number;
  secondaryCurrencyLines: readonly string[];
};

const EMPTY_PEOPLE: readonly PeopleListEntry[] = [];

export function usePeopleListViewModel() {
  const { workplaceId, defaultCurrencyCode } = useWorkplace();
  const isPrivacyMode = useEffectivePrivacyMode();
  const [peopleSnapshot, setPeopleSnapshot] = useState<{
    scope: string;
    rows: PeopleListEntry[];
  }>();
  const scope = JSON.stringify([workplaceId, defaultCurrencyCode]);
  const people = peopleSnapshot?.scope === scope ? peopleSnapshot.rows : EMPTY_PEOPLE;
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
  const balanceOverview = useMemo((): PeopleBalanceOverviewProps => {
    const owedToYouByCurrency = new Map<string, number>();
    const youOweByCurrency = new Map<string, number>();
    for (const row of activePeople) {
      for (const currency of row.currencies) {
        if (currency.owedToYou > 0)
          owedToYouByCurrency.set(
            currency.currencyCode,
            (owedToYouByCurrency.get(currency.currencyCode) ?? 0) + currency.owedToYou,
          );
        if (currency.youOwe > 0)
          youOweByCurrency.set(
            currency.currencyCode,
            (youOweByCurrency.get(currency.currencyCode) ?? 0) + currency.youOwe,
          );
      }
    }

    const secondaryCurrencyLines: string[] = [];
    for (const [currency, amount] of owedToYouByCurrency) {
      if (currency !== defaultCurrencyCode && amount > 0) {
        secondaryCurrencyLines.push(
          `${currency} · ${peopleStrings.owedToYou} ${formatMoneyAmount(amount, currency, isPrivacyMode)}`,
        );
      }
    }
    for (const [currency, amount] of youOweByCurrency) {
      if (currency !== defaultCurrencyCode && amount > 0) {
        secondaryCurrencyLines.push(
          `${currency} · ${peopleStrings.youOwe} ${formatMoneyAmount(amount, currency, isPrivacyMode)}`,
        );
      }
    }

    return {
      currencyCode: defaultCurrencyCode,
      owedToYou: owedToYouByCurrency.get(defaultCurrencyCode) ?? 0,
      youOwe: youOweByCurrency.get(defaultCurrencyCode) ?? 0,
      secondaryCurrencyLines,
    };
  }, [activePeople, defaultCurrencyCode, isPrivacyMode]);

  return {
    defaultCurrencyCode,
    people: filteredPeople,
    isLoading,
    loadError,
    activePeopleCount,
    hasArchivedPeople,
    balanceOverview,
    query,
    setQuery,
    includeArchived,
    setIncludeArchived,
    reload: () => setTick(value => value + 1),
  };
}
