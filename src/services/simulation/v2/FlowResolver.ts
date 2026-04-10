import { Flow } from './types';

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
      if (flow.meta?.source === 'BUDGET' || flow.meta?.source === 'PLANNED') {
        const dayFlows = flowsByDay.get(flow.dayOffset) || [];
        dayFlows.push(flow);
        flowsByDay.set(flow.dayOffset, dayFlows);
      } else {
        otherFlows.push(flow);
      }
    }

    for (const dayFlows of flowsByDay.values()) {
      const plannedFlows = dayFlows.filter(
        (flow): flow is Extract<Flow, { kind: 'INFLOW' | 'OUTFLOW' | 'TRANSFER' }> =>
          flow.meta?.source === 'PLANNED',
      );
      const budgetFlows = dayFlows.filter(
        (flow): flow is Extract<Flow, { kind: 'OUTFLOW' }> => flow.meta?.source === 'BUDGET',
      );

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
        const budgetId = budgetFlow.meta?.referenceId || `${budgetFlow.dayOffset}-budget`;
        const group = groupedBudgets.get(budgetId) || {
          flows: [],
          categoryIds: new Set(),
          plannedMatches: [],
        };
        group.flows.push(budgetFlow);

        const categoryIdsMeta = budgetFlow.meta?.categoryIds;
        const normalizedCategoryIds = categoryIdsMeta
          ? Array.isArray(categoryIdsMeta)
            ? categoryIdsMeta
            : Array.from(categoryIdsMeta as Iterable<string>)
          : [];
        const cats =
          normalizedCategoryIds.length > 0
            ? normalizedCategoryIds
            : budgetFlow.meta?.categoryId
              ? [budgetFlow.meta.categoryId]
              : [];

        cats.forEach(c => {
          group.categoryIds.add(c);
          allBudgetCategoryIds.add(c);
        });

        groupedBudgets.set(budgetId, group);
      }

      // Pass 1: Strict Category Match
      for (const group of groupedBudgets.values()) {
        const matchingPlanned = plannedFlows.filter(flow => {
          if (matchedPlanned.has(flow)) return false;
          const categoryId = flow.meta?.categoryId;
          return !!categoryId && group.categoryIds.has(categoryId);
        });
        group.plannedMatches = matchingPlanned;
        matchingPlanned.forEach(flow => matchedPlanned.add(flow));
      }

      // Pass 2: Broad Fallback
      const broadFallbackPlanned = plannedFlows.filter(flow => {
        if (matchedPlanned.has(flow)) return false;
        const categoryId = flow.meta?.categoryId;
        return !!categoryId && allBudgetCategoryIds.has(categoryId);
      });
      broadFallbackPlanned.forEach(flow => matchedPlanned.add(flow));
      let remainingFallback = broadFallbackPlanned.reduce((sum, f) => sum + f.amount, 0);

      // Resolution Phase
      for (const group of groupedBudgets.values()) {
        const matchingPlanned = group.plannedMatches;
        let budgetTotal = group.flows.reduce((sum, flow) => sum + flow.amount, 0);
        let plannedTotal = matchingPlanned.reduce((sum, flow) => sum + flow.amount, 0);

        if (remainingFallback > 0.01 && budgetTotal > plannedTotal) {
          const capacity = budgetTotal - plannedTotal;
          const usedFallback = Math.min(capacity, remainingFallback);
          plannedTotal += usedFallback;
          remainingFallback -= usedFallback;
        }

        if (plannedTotal === 0 && matchingPlanned.length === 0) {
          resolved.push(...group.flows);
          continue;
        }

        const isPlannedHigher = plannedTotal >= budgetTotal;
        const template = isPlannedHigher ? matchingPlanned[0] : group.flows[0];
        const effectiveAmount = Math.max(budgetTotal, plannedTotal);

        const resolvedFlow: Flow = {
          ...template,
          amount: effectiveAmount,
          meta: {
            ...template.meta,
            source: 'RESOLVED',
            originalSource: isPlannedHigher ? 'PLANNED' : 'BUDGET',
            label:
              template.meta?.label || (isPlannedHigher ? 'Planned Spending' : 'Budget Spending'),
            tags: [...(template.meta?.tags || []), 'RESOLVED_CONFLICT'],
          },
        } as Flow;

        resolved.push(resolvedFlow);
      }

      broadFallbackPlanned.forEach(flow => resolved.push(flow));

      plannedFlows
        .filter(flow => !matchedPlanned.has(flow))
        .forEach(flow => {
          resolved.push(flow);
        });
    }

    return [...otherFlows, ...resolved];
  }
}
