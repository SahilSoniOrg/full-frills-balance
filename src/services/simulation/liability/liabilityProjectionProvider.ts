import Account from '@/src/data/models/Account';
import { LiabilityFlowGenerator } from '@/src/services/simulation/engines/LiabilityFlowGenerator';
import {
  Flow,
  LiabilityMetadata,
  ProjectionProvider,
  SimulationContext,
} from '@/src/services/simulation/types';

export interface LiabilityProjectionInput {
  liabilityBalances: { account: Account; balance: number }[];
  metadataMap: Map<string, LiabilityMetadata>;
  statementBalances: Map<string, number>;
  settledSinceStatement: Map<string, number>;
  previousFlows?: Flow[];
}

export class LiabilityProjectionProvider implements ProjectionProvider<LiabilityProjectionInput> {
  readonly sourceType = 'liability';

  generate(context: SimulationContext, input: LiabilityProjectionInput): Flow[] {
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
