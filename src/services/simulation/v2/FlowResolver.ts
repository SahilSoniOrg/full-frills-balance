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
      const budgetsByReference = new Map<string, Extract<Flow, { kind: 'OUTFLOW' }>[]>();

      for (const budgetFlow of budgetFlows) {
        const budgetId = budgetFlow.meta?.referenceId || `${budgetFlow.dayOffset}-budget`;
        const group = budgetsByReference.get(budgetId) || [];
        group.push(budgetFlow);
        budgetsByReference.set(budgetId, group);
      }

      for (const budgetGroup of budgetsByReference.values()) {
        const categoryIds = new Set(
          budgetGroup.flatMap(flow =>
            flow.meta?.categoryIds?.length
              ? flow.meta.categoryIds
              : flow.meta?.categoryId
                ? [flow.meta.categoryId]
                : [],
          ),
        );

        const matchingPlanned = plannedFlows.filter(flow => {
          if (matchedPlanned.has(flow)) return false;
          const categoryId = flow.meta?.categoryId;
          return !!categoryId && categoryIds.has(categoryId);
        });

        if (matchingPlanned.length === 0) {
          resolved.push(...budgetGroup);
          continue;
        }

        const budgetTotal = budgetGroup.reduce((sum, flow) => sum + flow.amount, 0);
        const plannedTotal = matchingPlanned.reduce((sum, flow) => sum + flow.amount, 0);
        const isPlannedHigher = plannedTotal >= budgetTotal;
        const template = isPlannedHigher ? matchingPlanned[0] : budgetGroup[0];
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
        matchingPlanned.forEach(flow => matchedPlanned.add(flow));
      }

      plannedFlows
        .filter(flow => !matchedPlanned.has(flow))
        .forEach(flow => {
          resolved.push(flow);
        });
    }

    return [...otherFlows, ...resolved];
  }
}
