import { LiabilityFlowGenerator } from '@/src/services/simulation/engines/LiabilityFlowGenerator';
import { Flow, LiabilityMetadata, SimulationContext } from '@/src/services/simulation/types';
import type { AccountFields } from '@/src/types/plainDtos';

export interface LiabilityProjectionInput {
  liabilityBalances: { account: AccountFields; balance: number }[];
  metadataMap: Map<string, LiabilityMetadata>;
  statementBalances: Map<string, number>;
  settledSinceStatement: Map<string, number>;
  previousFlows?: Flow[];
}

export class LiabilityProjectionProvider {
  projectLiabilityFlows(context: SimulationContext, input: LiabilityProjectionInput): Flow[] {
    return LiabilityFlowGenerator.generate(
      context,
      input.previousFlows || [],
      input.liabilityBalances,
      input.metadataMap,
      input.statementBalances,
      input.settledSinceStatement,
    );
  }
}

export const liabilityProjectionProvider = new LiabilityProjectionProvider();
