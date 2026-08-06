import AccountMetadata from '@/src/data/models/AccountMetadata';
import type { LiabilityMetadata } from '@/src/services/simulation/types';

/** Account metadata plus runtime-only fields used by import fixtures and tests. */
export type LiabilityMetadataSource = AccountMetadata & Pick<LiabilityMetadata, 'emiAmount'>;

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
