import type { AccountFields } from '@/src/types/domain';
import { AccountId } from '@/src/types/domain';
import { DebtEntry, DebtType, Flow, FlowCategory, FlowSource } from '../types';
import { resolveFlowSemanticTarget } from '../utils/FlowMetadataResolver';

/**
 * Extracts debt-related entries (liabilities) from a list of flows.
 */
export const selectDebtEntries = (
  allFlows: Flow[],
  accountMap: Map<string, AccountFields>,
): DebtEntry[] => {
  const debtMap = new Map<AccountId, DebtEntry>();

  allFlows
    .filter(flow => flow.timeframe === 'FUTURE' && flow.category === FlowCategory.DEBT)
    .forEach(flow => {
      const target = resolveFlowSemanticTarget(flow, accountMap);
      const accId = target.accountId as AccountId;

      const entry = debtMap.get(accId) || {
        accountId: accId,
        accountName: target.accountName,
        amount: 0,
        dayOffset: flow.dayOffset,
        type:
          flow.origin === FlowSource.BUDGET
            ? DebtType.BUDGET
            : flow.origin === FlowSource.LIABILITY
              ? DebtType.FALLBACK
              : DebtType.PLANNED_PAYMENT,
      };

      entry.amount += flow.amount;
      debtMap.set(accId, entry);
    });

  return Array.from(debtMap.values());
};
