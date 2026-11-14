import type { SerializedAccountMetadataPayload } from '@/src/types/plainDtos';

/** Stable field order and null normalization for persisted account audit snapshots. */
export function accountMetadataAuditState(
  metadata: Partial<SerializedAccountMetadataPayload>,
): Record<string, unknown> {
  return {
    statementDay: metadata.statementDay ?? null,
    dueDay: metadata.dueDay ?? null,
    minimumPaymentAmount: metadata.minimumPaymentAmount ?? null,
    minimumBalanceAmount: metadata.minimumBalanceAmount ?? null,
    creditLimitAmount: metadata.creditLimitAmount ?? null,
    aprBps: metadata.aprBps ?? null,
    emiDay: metadata.emiDay ?? null,
    loanTenureMonths: metadata.loanTenureMonths ?? null,
    autopayEnabled: metadata.autopayEnabled ?? null,
    gracePeriodDays: metadata.gracePeriodDays ?? null,
    payFromAccountId: metadata.payFromAccountId ?? null,
    minPaymentOnly: metadata.minPaymentOnly ?? null,
    minimumPaymentPercent: metadata.minimumPaymentPercent ?? null,
    notes: metadata.notes ?? null,
  };
}
