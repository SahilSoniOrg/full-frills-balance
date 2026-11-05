import type { AccountId } from '@/src/types/ids';
import type { RuleCompatibility, SmsAccountRecognition } from '@/src/types/accountMatcher';
import { TransactionDirection } from '@/src/types/enums';
import { resolveAccountFlowRoles } from './accountFlowRoles';

export interface RuleAccountPair {
  sourceAccountId?: AccountId | null;
  categoryAccountId?: AccountId | null;
}
export function checkRuleCompatibility(
  recognition: SmsAccountRecognition,
  rule: RuleAccountPair,
  isFinancialLeaf: (id: AccountId) => boolean,
  direction?: TransactionDirection,
): RuleCompatibility {
  if (recognition.status === 'indeterminate') return 'indeterminate';
  if (!recognition.accountIds.length) return 'no_recognition';
  const financial = new Set<AccountId>();
  if (rule.sourceAccountId) financial.add(rule.sourceAccountId);
  if (rule.categoryAccountId && isFinancialLeaf(rule.categoryAccountId))
    financial.add(rule.categoryAccountId);
  if (!recognition.accountIds.every(id => financial.has(id))) return 'contradictory';
  if (!recognition.flows?.length) return 'compatible';
  const roles = resolveAccountFlowRoles(recognition);
  if (roles.isAmbiguous) return 'contradictory';
  if (direction !== TransactionDirection.DEBIT && direction !== TransactionDirection.CREDIT)
    return 'indeterminate';

  const financialCategory =
    rule.categoryAccountId && isFinancialLeaf(rule.categoryAccountId)
      ? rule.categoryAccountId
      : undefined;
  const outgoing =
    direction === TransactionDirection.DEBIT ? rule.sourceAccountId : financialCategory;
  const incoming =
    direction === TransactionDirection.CREDIT ? rule.sourceAccountId : financialCategory;
  return recognition.flows.every(
    ({ accountId, flow }) => accountId === (flow === 'incoming' ? incoming : outgoing),
  )
    ? 'compatible'
    : 'contradictory';
}
