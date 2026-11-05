import { accountQueryRepository } from '@/src/data/repositories/account';
import { transactionAutoPostRuleRepository } from '@/src/data/repositories/TransactionAutoPostRuleRepository';
import type TransactionAutoPostRule from '@/src/data/models/TransactionAutoPostRule';
import { loadAccountMatcherContext } from '@/src/services/accounts/accountMatcherContext';
import { smsRuleEngine } from '@/src/services/sms/SmsRuleEngine';
import type { AccountMatcherContext } from '@/src/types/accountMatcher';
import type { AccountId, WorkplaceId } from '@/src/types/ids';

export interface SmsDecisionContext {
  activeRules: TransactionAutoPostRule[];
  matchers: AccountMatcherContext;
  sourceAccountCurrency: (accountId: AccountId) => string | undefined;
  isFinancialLeaf: (accountId: AccountId) => boolean;
}

/** One snapshot for scan analysis, serialized writer revalidation, or pending review refresh. */
export async function loadSmsDecisionContext(
  workplaceId: WorkplaceId,
): Promise<SmsDecisionContext> {
  const [rules, matchers] = await Promise.all([
    transactionAutoPostRuleRepository.findActiveByWorkplace(workplaceId),
    loadAccountMatcherContext(workplaceId),
  ]);
  const activeRules = rules.sort(
    (a, b) => smsRuleEngine.getRulePriority(b) - smsRuleEngine.getRulePriority(a),
  );
  const sourceIds = [
    ...new Set(
      activeRules.flatMap(rule => {
        const id = smsRuleEngine.getRuleDefinition(rule).actions.sourceAccountId;
        return id ? [id] : [];
      }),
    ),
  ];
  const sourceAccounts = await accountQueryRepository.findAllByIds(workplaceId, sourceIds);
  const currencies = new Map(sourceAccounts.map(account => [account.id, account.currencyCode]));
  const financialIds = new Set(matchers.eligibleAccountIds);
  return {
    activeRules,
    matchers,
    sourceAccountCurrency: id => currencies.get(id),
    isFinancialLeaf: id => financialIds.has(id),
  };
}
