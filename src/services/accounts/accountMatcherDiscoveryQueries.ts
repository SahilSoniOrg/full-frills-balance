import { preferences } from '@/src/services/preferences';
import { parseStoredMatcherDefinition } from '@/src/services/sms/recognition/accountMatcherDefinition';
import {
  discoverAccountMatcherProposals,
  type AccountMatcherDiscoveryMatcher,
} from '@/src/services/sms/recognition/accountMatcherDiscovery';
import type { AccountId, WorkplaceId } from '@/src/types/ids';
import {
  loadAccountMatcherPageData,
  type AccountMatcherPageData,
} from './accountMatcherEvidenceQueries';

/** Discovery projection over a caller-owned snapshot; performs no database reads. */
export function projectAccountMatcherDiscovery(
  workplaceId: WorkplaceId,
  accountId: AccountId,
  data: AccountMatcherPageData,
) {
  const matchers: AccountMatcherDiscoveryMatcher[] = data.matchers
    .filter(matcher => matcher.accountId === accountId)
    .map(matcher => ({
      id: matcher.id,
      accountId: matcher.accountId,
      definition: parseStoredMatcherDefinition(matcher.definitionJson),
      conditionsKey: matcher.conditionsKey,
      isEnabled: matcher.isEnabled,
    }));
  const suppressions = preferences.accountMatchers.list(workplaceId, accountId);
  return {
    evidence: data.evidence,
    comparisonMessages: data.comparisonMessages,
    latestLinkTime: data.latestLinkTime,
    ...discoverAccountMatcherProposals({
      accountId,
      evidence: data.evidence,
      comparisonMessages: data.comparisonMessages,
      matchers,
      suppressions,
    }),
    matchers,
    suppressions,
  };
}

export async function loadAccountMatcherDiscovery(workplaceId: WorkplaceId, accountId: AccountId) {
  return projectAccountMatcherDiscovery(
    workplaceId,
    accountId,
    await loadAccountMatcherPageData(workplaceId, accountId),
  );
}
