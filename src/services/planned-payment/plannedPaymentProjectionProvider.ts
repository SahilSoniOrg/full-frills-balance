import Journal from '@/src/data/models/Journal';
import Transaction from '@/src/data/models/Transaction';
import { PlannedFlowGenerator } from '@/src/services/simulation/engines/PlannedFlowGenerator';
import {
  ScheduledProjection,
  SimulationContext,
  SimulationPlannedPayment,
} from '@/src/services/simulation/types';

export interface PlannedPaymentProjectionInput {
  plannedPayments: SimulationPlannedPayment[];
  projectablePlannedJournals: Journal[];
  expenseAccountIds: Set<string>;
  journalTransactionsMap: Map<string, Transaction[]>;
}

export class PlannedPaymentProjectionProvider {
  /**
   * Projects scheduled payment obligations.
   * Delayed discretization: Emits semantic ScheduledProjection[] without flattening into Flow[].
   */
  projectScheduled(
    context: SimulationContext,
    input: PlannedPaymentProjectionInput,
  ): ScheduledProjection[] {
    const { projections } = PlannedFlowGenerator.generate(
      context,
      input.plannedPayments,
      input.projectablePlannedJournals,
      input.expenseAccountIds,
      input.journalTransactionsMap,
    );
    return projections;
  }
}

export const plannedPaymentProjectionProvider = new PlannedPaymentProjectionProvider();
