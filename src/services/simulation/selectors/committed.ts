import { AccountId } from '@/src/types/ids';
import { type AccountFields } from '@/src/types/plainDtos';
import { AccountCommitment, DebtType, Flow, FlowCategory } from '../types';
import { resolveFlowSemanticTarget } from '../utils/FlowMetadataResolver';
import { isCommitmentFlow } from '../utils/FlowPolicy';

/**
 * Extracts and groups committed spending (budget + planned) from a list of flows.
 */
export const selectCommittedEntries = (
  allFlows: Flow[],
  accountMap: Map<string, AccountFields>,
  firstMajorInflowDay: number | null,
): AccountCommitment[] => {
  const committedMap = new Map<string, AccountCommitment>();

  allFlows
    .filter(flow => flow.timeframe === 'FUTURE' && isCommitmentFlow(flow))
    .forEach(flow => {
      const target = resolveFlowSemanticTarget(flow, accountMap);
      const entry: AccountCommitment = committedMap.get(target.accountId) || {
        accountId: target.accountId as AccountId,
        accountName: target.accountName,
        amount: 0,
        details: [],
      };
      entry.amount += flow.amount;

      if (flow.category === FlowCategory.BUDGET) {
        const isPostIncome = firstMajorInflowDay !== null && flow.dayOffset >= firstMajorInflowDay;
        const suffix = isPostIncome ? '_post' : '_pre';
        const detailId = `${flow.referenceId || 'budget'}${suffix}`;
        const existing = entry.details.find(d => d.id === detailId);

        if (existing) {
          existing.amount += flow.amount;
        } else {
          entry.details.push({
            id: detailId,
            name: flow.label || 'Budget Burn',
            amount: flow.amount,
            dayOffset: isPostIncome ? firstMajorInflowDay || 0 : 0,
            type: DebtType.BUDGET,
          });
        }
      } else {
        entry.details.push({
          id: flow.referenceId || `${target.accountId}-${flow.dayOffset}-${flow.amount}`,
          name: flow.label || target.accountName || 'Spending',
          amount: flow.amount,
          dayOffset: flow.dayOffset,
          type:
            flow.category === FlowCategory.PLANNED_EXPENSE
              ? DebtType.PLANNED_PAYMENT
              : DebtType.FALLBACK,
        });
      }

      committedMap.set(target.accountId, entry);
    });

  return Array.from(committedMap.values());
};
