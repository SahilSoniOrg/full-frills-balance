import AccountMetadata from '@/src/data/models/AccountMetadata';
import type { LiabilityMetadata } from '@/src/services/simulation/types';

/** Maps persisted account metadata into simulation liability settings. */
export function toLiabilityMetadata(metadata: AccountMetadata): LiabilityMetadata {
  return {
    statementDay: metadata.statementDay,
    dueDay: metadata.dueDay,
    minimumPaymentAmount: metadata.minimumPaymentAmount,
    emiDay: metadata.emiDay,
    payFromAccountId: metadata.payFromAccountId,
    minPaymentOnly: metadata.minPaymentOnly,
    minimumPaymentPercent: metadata.minimumPaymentPercent,
  };
}
