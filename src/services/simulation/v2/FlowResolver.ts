import { Flow } from './types';

export class FlowResolver {
  /**
   * Resolves conflicts between different flow sources (e.g., Budget vs Planned).
   * Implements the "Higher of the 2" rule: for a given (day, category),
   * we take the maximum of budget burn vs planned spend.
   */
  static resolveConflicts(flows: Flow[]): Flow[] {
    const resolved: Flow[] = [];

    // Group flows by day and category
    // key: dayOffset:categoryId
    const groups = new Map<string, Flow[]>();
    const otherFlows: Flow[] = [];

    for (const flow of flows) {
      if (
        flow.meta?.categoryId &&
        (flow.meta.source === 'BUDGET' || flow.meta.source === 'PLANNED')
      ) {
        const key = `${flow.dayOffset}:${flow.meta.categoryId}`;
        const group = groups.get(key) || [];
        group.push(flow);
        groups.set(key, group);
      } else {
        otherFlows.push(flow);
      }
    }

    // Process groups
    for (const [, group] of groups.entries()) {
      if (group.length === 1) {
        resolved.push(group[0]);
        continue;
      }

      const budgetFlows = group.filter(f => f.meta?.source === 'BUDGET');
      const plannedFlows = group.filter(f => f.meta?.source === 'PLANNED');

      if (budgetFlows.length === 0) {
        resolved.push(...plannedFlows);
        continue;
      }
      if (plannedFlows.length === 0) {
        resolved.push(...budgetFlows);
        continue;
      }

      // Higher of the 2 rule
      const budgetTotal = budgetFlows.reduce((sum, f) => sum + f.amount, 0);
      const plannedTotal = plannedFlows.reduce((sum, f) => sum + f.amount, 0);

      const isPlannedHigher = plannedTotal >= budgetTotal;
      const template = isPlannedHigher ? plannedFlows[0] : budgetFlows[0];
      const effectiveAmount = Math.max(budgetTotal, plannedTotal);

      const resolvedFlow: Flow = {
        ...template,
        amount: effectiveAmount,
        meta: {
          ...template.meta,
          source: 'RESOLVED',
          originalSource: isPlannedHigher ? 'PLANNED' : 'BUDGET',
          label: template.meta?.label || (isPlannedHigher ? 'Planned Spending' : 'Budget Spending'),
          tags: [...(template.meta?.tags || []), 'RESOLVED_CONFLICT'],
        },
      } as any;

      resolved.push(resolvedFlow);
    }

    return [...otherFlows, ...resolved];
  }
}
