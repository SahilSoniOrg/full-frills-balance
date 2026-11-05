import { accountQueryRepository } from '@/src/data/repositories/account';
import { accountMatcherRepository } from '@/src/data/repositories/AccountMatcherRepository';
import { parseStoredMatcherDefinition } from '@/src/services/sms/recognition/accountMatcherDefinition';
import { compileAccountMatcher } from '@/src/services/sms/recognition/accountMatcherEvaluator';
import type { AccountMatcherContext } from '@/src/types/accountMatcher';
import type { WorkplaceId } from '@/src/types/ids';
import { getEligibleMatcherAccountIds } from './accountMatcherEligibility';

/** Loads enabled matchers and their current leaf-financial-account eligibility. */
export async function loadAccountMatcherContext(
  workplaceId: WorkplaceId,
): Promise<AccountMatcherContext> {
  const [matchers, accounts] = await Promise.all([
    accountMatcherRepository.findEnabledByWorkplace(workplaceId),
    accountQueryRepository.findAll(workplaceId),
  ]);

  const eligibleAccountIds = getEligibleMatcherAccountIds(accounts);

  return {
    eligibleAccountIds: [...eligibleAccountIds],
    matchers: matchers.map(matcher => {
      const record = {
        id: matcher.id,
        accountId: matcher.accountId,
        definition: parseStoredMatcherDefinition(matcher.definitionJson),
        isEnabled: matcher.isEnabled,
        eligible: eligibleAccountIds.has(matcher.accountId),
      };
      return { ...record, compiled: compileAccountMatcher(record) };
    }),
  };
}
