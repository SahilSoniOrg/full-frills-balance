import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import {
  loadAccountMatcherPageData,
  observeAccountMatcherEvidenceChanges,
  type AccountMatcherPageData,
} from '@/src/services/accounts/accountMatcherEvidenceQueries';
import { evaluateAccountMatcherMatches } from '@/src/services/accounts/accountMatcherMatchQueries';
import { projectAccountMatcherDiscovery } from '@/src/services/accounts/accountMatcherDiscoveryQueries';
import { preferences } from '@/src/services/preferences';
import type { AccountMatcherSnapshot } from '@/src/types/accountMatcher';
import type { AccountId } from '@/src/types/ids';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AccountMatcherManagementViewModel } from './details/types';

const EMPTY_DISCOVERY: Pick<
  AccountMatcherManagementViewModel,
  'proposals' | 'suppressedProposals'
> = { proposals: [], suppressedProposals: [] };
const EMPTY_MATCHES = new Map();

/** One read and one invalidation owner for matcher management evidence and projections. */
export function useAccountMatcherManagementViewModel(
  accountId: AccountId,
  storedMatchers: readonly AccountMatcherSnapshot[],
  matcherVersion: number,
): AccountMatcherManagementViewModel {
  const { workplaceId } = useWorkplace();
  const [revision, setRevision] = useState(0);
  const [suppressionVersion, setSuppressionVersion] = useState(0);
  const identity = `${workplaceId}:${accountId}`;
  const loadKey = `${identity}:${revision}`;
  const [loaded, setLoaded] = useState<{
    key: string;
    data: AccountMatcherPageData | null;
    error: string | null;
  } | null>(null);

  const data = loaded?.key === loadKey ? loaded.data : null;
  const journalIdsKey = (data?.journalIds ?? []).join(',');

  useEffect(() => {
    const subscription = observeAccountMatcherEvidenceChanges(
      workplaceId,
      data?.journalIds ?? [],
    ).subscribe(() => setRevision(value => value + 1));
    return () => subscription.unsubscribe();
    // Journal IDs are the subscription key; the loaded object changes on every refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journalIdsKey, workplaceId]);

  useEffect(() => {
    let active = true;
    loadAccountMatcherPageData(workplaceId, accountId)
      .then(next => {
        if (active) setLoaded({ key: loadKey, data: next, error: null });
      })
      .catch(() => {
        if (active) setLoaded({ key: loadKey, data: null, error: 'load' });
      });
    return () => {
      active = false;
    };
  }, [accountId, loadKey, workplaceId]);

  const discovery = useMemo(() => {
    void suppressionVersion;
    return data ? projectAccountMatcherDiscovery(workplaceId, accountId, data) : EMPTY_DISCOVERY;
  }, [accountId, data, suppressionVersion, workplaceId]);
  const matches = useMemo(() => {
    void matcherVersion;
    return data ? evaluateAccountMatcherMatches(data, accountId, storedMatchers) : EMPTY_MATCHES;
  }, [accountId, data, matcherVersion, storedMatchers]);

  const refresh = useCallback(() => {
    setRevision(value => value + 1);
    setSuppressionVersion(value => value + 1);
  }, []);
  const dismiss = useCallback(
    (conditionsKey: string) => {
      preferences.accountMatchers.dismiss(workplaceId, accountId, conditionsKey);
      setSuppressionVersion(value => value + 1);
    },
    [accountId, workplaceId],
  );
  const restore = useCallback(
    (conditionsKey: string) => {
      preferences.accountMatchers.restore(workplaceId, accountId, conditionsKey);
      setSuppressionVersion(value => value + 1);
    },
    [accountId, workplaceId],
  );

  const isLoading = loaded?.key !== loadKey;
  return {
    ...discovery,
    byMatcherId: matches,
    inspectedCount: data?.inspectedCount ?? 0,
    inspectedDates: data?.inspectedDates ?? null,
    recognitions: data?.recentRecognitions ?? [],
    isLoading,
    error: loaded?.key === loadKey ? loaded.error : null,
    refresh,
    dismiss,
    restore,
  };
}
