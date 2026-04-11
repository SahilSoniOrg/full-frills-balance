import { AppConfig } from '@/src/constants/app-config';
import { Flow, FlowCategory, FlowSource } from './types';

export class FlowResolver {
  /**
   * Resolves conflicts between budget burns and planned spend.
   * A budget flow should reconcile against planned flows in any category
   * covered by that budget on the same day, and the effective pressure is
   * the higher of the two totals.
   */
  static resolveConflicts(flows: Flow[]): Flow[] {
    const resolved: Flow[] = [];
    const otherFlows: Flow[] = [];
    const flowsByDay = new Map<number, Flow[]>();

    for (const flow of flows) {
      if (
        flow.category === FlowCategory.BUDGET ||
        flow.category === FlowCategory.EXPENSE ||
        flow.category === FlowCategory.PLANNED_EXPENSE ||
        flow.category === FlowCategory.INCOME
      ) {
        const dayFlows = flowsByDay.get(flow.dayOffset) || [];
        dayFlows.push(flow);
        flowsByDay.set(flow.dayOffset, dayFlows);
      } else {
        otherFlows.push(flow);
      }
    }

    for (const [_dayOffset, dayFlows] of flowsByDay.entries()) {
      // Planned outflows that can be reconciled against budget
      const plannedOutflows = dayFlows.filter(
        (flow): flow is Extract<Flow, { kind: 'OUTFLOW' | 'TRANSFER' }> =>
          (flow.category === FlowCategory.EXPENSE ||
            flow.category === FlowCategory.PLANNED_EXPENSE) &&
          (flow.kind === 'OUTFLOW' || flow.kind === 'TRANSFER'),
      );

      const budgetFlows = dayFlows.filter(
        (flow): flow is Extract<Flow, { kind: 'OUTFLOW' }> => flow.category === FlowCategory.BUDGET,
      );

      // Income and other flows are passed through after grouping
      const incomeFlows = dayFlows.filter(flow => flow.category === FlowCategory.INCOME);

      if (budgetFlows.length === 0) {
        resolved.push(...dayFlows);
        continue;
      }

      const matchedPlanned = new Set<Flow>();
      const allBudgetCategoryIds = new Set<string>();
      const groupedBudgets = new Map<
        string,
        {
          flows: Extract<Flow, { kind: 'OUTFLOW' }>[];
          categoryIds: Set<string>;
          plannedMatches: Flow[];
        }
      >();

      for (const budgetFlow of budgetFlows) {
        const budgetId = budgetFlow.referenceId;
        const group = groupedBudgets.get(budgetId) || {
          flows: [],
          categoryIds: new Set(),
          plannedMatches: [],
        };
        group.flows.push(budgetFlow);

        if (budgetFlow.categoryId) {
          group.categoryIds.add(budgetFlow.categoryId);
          allBudgetCategoryIds.add(budgetFlow.categoryId);
        }

        groupedBudgets.set(budgetId, group);
      }

      // Pass 1: Strict Category Match
      for (const group of groupedBudgets.values()) {
        const matchingPlanned = plannedOutflows.filter(flow => {
          if (matchedPlanned.has(flow)) return false;
          return !!flow.categoryId && group.categoryIds.has(flow.categoryId);
        });
        group.plannedMatches = matchingPlanned;
        matchingPlanned.forEach(flow => matchedPlanned.add(flow));
      }

      // Pass 2: Broad Fallback (Match remaining capacity)
      const broadFallbackPlanned = plannedOutflows.filter(flow => {
        if (matchedPlanned.has(flow)) return false;
        return !!flow.categoryId && allBudgetCategoryIds.has(flow.categoryId);
      });
      broadFallbackPlanned.forEach(flow => matchedPlanned.add(flow));

      const fallbackTracking = broadFallbackPlanned.map(f => ({
        original: f,
        remaining: f.amount,
      }));

      // Resolution Phase
      for (const group of groupedBudgets.values()) {
        const matchingPlanned = group.plannedMatches;
        let budgetTotal = group.flows.reduce((sum, flow) => sum + flow.amount, 0);
        let plannedTotal = matchingPlanned.reduce((sum, flow) => sum + flow.amount, 0);

        // Consume fallback capacity if needed
        if (budgetTotal > plannedTotal) {
          let capacity = budgetTotal - plannedTotal;
          for (const tracking of fallbackTracking) {
            if (capacity <= AppConfig.defaults.simulation.financialEpsilon) break;
            if (tracking.remaining <= 0) continue;

            const consumed = Math.min(capacity, tracking.remaining);
            tracking.remaining -= consumed;
            plannedTotal += consumed;
            capacity -= consumed;
          }
        }

        if (plannedTotal === 0 && matchingPlanned.length === 0) {
          resolved.push(...group.flows);
          continue;
        }

        const isPlannedHigher = plannedTotal >= budgetTotal;
        const template = isPlannedHigher ? matchingPlanned[0] || group.flows[0] : group.flows[0];
        const effectiveAmount = Math.max(budgetTotal, plannedTotal);

        // Resolved flow MAINTAINS its semantic category, but sets resolvedFrom
        const resolvedFlow: Flow = {
          ...template,
          amount: effectiveAmount,
          category: template.category, // Keep original (BUDGET vs EXPENSE/PLANNED_EXPENSE)
          timeframe: template.timeframe,
          resolvedFrom: isPlannedHigher ? FlowSource.PLANNED_PAYMENT : FlowSource.BUDGET,
          meta: {
            ...template.meta,
            tags: [...(template.meta?.tags || []), 'RESOLVED_CONFLICT'],
          },
        } as Flow;

        resolved.push(resolvedFlow);
      }

      // Add residual fallback flows that weren't fully consumed by budget groups
      for (const tracking of fallbackTracking) {
        if (tracking.remaining > AppConfig.defaults.simulation.financialEpsilon) {
          resolved.push({
            ...tracking.original,
            amount: tracking.remaining,
            meta: {
              ...(tracking.original.meta || {}),
              tags: [...(tracking.original.meta?.tags || []), 'RECONCILED_FALLBACK'],
            },
          });
        }
      }

      // Add income and unmatched planned outflows
      resolved.push(...incomeFlows);
      plannedOutflows
        .filter(flow => !matchedPlanned.has(flow))
        .forEach(flow => {
          resolved.push(flow);
        });
    }

    return [...otherFlows, ...resolved];
  }
}
