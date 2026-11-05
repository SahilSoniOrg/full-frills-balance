import type { AccountId } from '@/src/types/ids';
import type { RuleCompatibility, SmsAccountRecognition } from '@/src/types/accountMatcher';
import { TransactionDirection } from '@/src/types/enums';
import { resolveAccountFlowRoles, type AccountFlowRoles } from './accountFlowRoles';

export interface RuleAccountPair {
  sourceAccountId?: AccountId | null;
  categoryAccountId?: AccountId | null;
}
export interface AccountRuleRecognitionResolution {
  compatibility?: RuleCompatibility;
  flowRoles: AccountFlowRoles;
}

/** Resolves declared roles and rule compatibility once for all SMS consumers. */
export function resolveAccountRuleRecognition(
  recognition: SmsAccountRecognition,
  rule: RuleAccountPair | undefined,
  isFinancialLeaf: (id: AccountId) => boolean,
  direction?: TransactionDirection,
): AccountRuleRecognitionResolution {
  const flowRoles = resolveAccountFlowRoles(recognition);
  if (!rule) return { flowRoles };
  if (recognition.status === 'indeterminate') return { compatibility: 'indeterminate', flowRoles };
  if (!recognition.accountIds.length) return { compatibility: 'no_recognition', flowRoles };
  const financial = new Set<AccountId>();
  if (rule.sourceAccountId) financial.add(rule.sourceAccountId);
  if (rule.categoryAccountId && isFinancialLeaf(rule.categoryAccountId))
    financial.add(rule.categoryAccountId);
  if (!recognition.accountIds.every(id => financial.has(id)))
    return { compatibility: 'contradictory', flowRoles };
  if (!recognition.flows?.length) return { compatibility: 'compatible', flowRoles };
  if (flowRoles.isAmbiguous) return { compatibility: 'contradictory', flowRoles };
  if (direction !== TransactionDirection.DEBIT && direction !== TransactionDirection.CREDIT)
    return { compatibility: 'indeterminate', flowRoles };

  const financialCategory =
    rule.categoryAccountId && isFinancialLeaf(rule.categoryAccountId)
      ? rule.categoryAccountId
      : undefined;
  const outgoing =
    direction === TransactionDirection.DEBIT ? rule.sourceAccountId : financialCategory;
  const incoming =
    direction === TransactionDirection.CREDIT ? rule.sourceAccountId : financialCategory;
  const compatible = recognition.flows.every(
    ({ accountId, flow }) => accountId === (flow === 'incoming' ? incoming : outgoing),
  );
  return {
    compatibility: compatible ? 'compatible' : 'contradictory',
    flowRoles,
  };
}

export function checkRuleCompatibility(
  recognition: SmsAccountRecognition,
  rule: RuleAccountPair,
  isFinancialLeaf: (id: AccountId) => boolean,
  direction?: TransactionDirection,
): RuleCompatibility {
  return resolveAccountRuleRecognition(recognition, rule, isFinancialLeaf, direction)
    .compatibility!;
}
