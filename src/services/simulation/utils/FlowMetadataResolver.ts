import type { AccountFields } from '@/src/types/domain';
import { Flow, FlowCategory } from '../types';

/**
 * Resolves the "Semantic Target" of a flow.
 *
 * A semantic target is the account or budget entity that the flow is *for*,
 * rather than the liquid account it is *passing through*.
 *
 * Example:
 * - A Debt payment from "Checking" to "Credit Card" has:
 *   - Physical source: Checking
 *   - Semantic target: Credit Card
 * - A Budget burn for "Groceries" using "Checking" has:
 *   - Physical source: Checking
 *   - Semantic target: Groceries (Budget ID)
 */
export function resolveFlowSemanticTarget(flow: Flow, accountMap: Map<string, AccountFields>) {
  // 1. Debt flows always target the liability account (referenceId)
  if (flow.category === FlowCategory.DEBT) {
    const targetId =
      flow.referenceId || (flow.kind === 'TRANSFER' ? flow.toAccountId : flow.accountId);
    const acc = accountMap.get(targetId);
    return {
      accountId: targetId,
      accountName: acc?.name || flow.label || 'Liability',
    };
  }

  // 2. Budget flows always target the budget entity (referenceId)
  if (flow.category === FlowCategory.BUDGET) {
    const targetId = flow.referenceId || 'budget';
    const acc = accountMap.get(targetId);
    return {
      accountId: targetId,
      accountName: acc?.name || flow.label || 'Budget',
    };
  }

  // 3. Planned Expenses / Income / Transfers
  // categoryId is the primary semantic identifier for "Goal" or "Category"
  const targetId =
    flow.categoryId || (flow.kind === 'TRANSFER' ? flow.toAccountId : flow.accountId) || 'other';
  const acc = accountMap.get(targetId);

  return {
    accountId: targetId,
    accountName: acc?.name || flow.label || 'Other',
  };
}
