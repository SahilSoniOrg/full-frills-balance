import AccountMetadata from '@/src/data/models/AccountMetadata';
import type { LiabilityMetadata } from '@/src/services/simulation/types';

/** Fields read by `toLiabilityMetadata` — persisted metadata plus runtime-only `emiAmount`. */
export type LiabilityMetadataSource = Pick<
  AccountMetadata,
  | 'statementDay'
  | 'dueDay'
  | 'minimumPaymentAmount'
  | 'emiDay'
  | 'payFromAccountId'
  | 'minPaymentOnly'
  | 'minimumPaymentPercent'
> &
  Pick<LiabilityMetadata, 'emiAmount'>;

/** Maps persisted account metadata into simulation liability settings. */
export function toLiabilityMetadata(metadata: LiabilityMetadataSource): LiabilityMetadata {
  return {
    statementDay: metadata.statementDay,
    dueDay: metadata.dueDay,
    minimumPaymentAmount: metadata.minimumPaymentAmount,
    emiDay: metadata.emiDay,
    payFromAccountId: metadata.payFromAccountId,
    minPaymentOnly: metadata.minPaymentOnly,
    minimumPaymentPercent: metadata.minimumPaymentPercent,
    emiAmount: metadata.emiAmount,
  };
}
