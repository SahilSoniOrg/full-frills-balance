import Journal from '@/src/data/models/Journal';
import Transaction from '@/src/data/models/Transaction';
import { PlannedFlowGenerator } from '@/src/services/simulation/engines/PlannedFlowGenerator';
import {
  Flow,
  ProjectionProvider,
  SimulationContext,
  SimulationPlannedPayment,
} from '@/src/services/simulation/types';

export interface PlannedPaymentProjectionInput {
  plannedPayments: SimulationPlannedPayment[];
  projectablePlannedJournals: Journal[];
  expenseAccountIds: Set<string>;
  journalTransactionsMap: Map<string, Transaction[]>;
}

export class PlannedPaymentProjectionProvider implements ProjectionProvider<PlannedPaymentProjectionInput> {
  readonly sourceType = 'planned_payment';

  generate(context: SimulationContext, input?: PlannedPaymentProjectionInput): Flow[] {
    if (!input) return [];
    const { flows } = PlannedFlowGenerator.generate(
      context,
      input.plannedPayments,
      input.projectablePlannedJournals,
      input.expenseAccountIds,
      input.journalTransactionsMap,
    );
    return flows;
  }
}

export const plannedPaymentProjectionProvider = new PlannedPaymentProjectionProvider();
