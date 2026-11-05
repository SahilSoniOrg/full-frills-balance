import { accountMatcherRepository } from '@/src/data/repositories/AccountMatcherRepository';
import { preferences } from '@/src/services/preferences';
import { parseStoredMatcherDefinition } from '@/src/services/sms/recognition/accountMatcherDefinition';
import {
  discoverAccountMatcherProposals,
  type AccountMatcherDiscoveryMatcher,
} from '@/src/services/sms/recognition/accountMatcherDiscovery';
import type { AccountId, WorkplaceId } from '@/src/types/ids';
import { loadAccountMatcherEvidence } from './accountMatcherEvidenceQueries';

export async function loadAccountMatcherDiscovery(workplaceId: WorkplaceId, accountId: AccountId) {
  const [evidence, storedMatchers] = await Promise.all([
    loadAccountMatcherEvidence(workplaceId, accountId),
    accountMatcherRepository.findForAccount(workplaceId, accountId),
  ]);
  const matchers: AccountMatcherDiscoveryMatcher[] = storedMatchers.map(matcher => ({
    id: matcher.id,
    accountId: matcher.accountId,
    definition: parseStoredMatcherDefinition(matcher.definitionJson),
    conditionsKey: matcher.conditionsKey,
    isEnabled: matcher.isEnabled,
  }));
  const suppressions = preferences.accountMatchers.list(workplaceId, accountId);
  return {
    ...evidence,
    ...discoverAccountMatcherProposals({
      accountId,
      evidence: evidence.evidence,
      comparisonMessages: evidence.comparisonMessages,
      matchers,
      suppressions,
    }),
    matchers,
    suppressions,
  };
}
