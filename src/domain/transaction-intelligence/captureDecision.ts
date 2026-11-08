import type { AccountId } from '@/src/types/ids';

export type EconomicEvidence =
  'purchase' | 'salary' | 'transfer' | 'refund' | 'incomplete' | 'unknown';
export interface CaptureAccountEvidence {
  status: 'none' | 'recognized' | 'indeterminate';
  accountIds: readonly AccountId[];
  outgoingAccountId?: AccountId;
  incomingAccountId?: AccountId;
  ambiguous: boolean;
}
export type CaptureClassification =
  | { kind: 'review'; reason: string }
  | {
      kind: 'expense' | 'income' | 'transfer';
      sourceAccountId: AccountId;
      destinationAccountId?: AccountId;
    };

/** Source-independent economic classification. Account direction alone never establishes purpose. */
export function classifyCapture(
  evidence: EconomicEvidence,
  direction: 'debit' | 'credit' | 'unknown',
  accounts: CaptureAccountEvidence,
): CaptureClassification {
  if (accounts.status !== 'recognized' || accounts.ambiguous)
    return { kind: 'review', reason: 'Resolve the financial accounts.' };
  if (evidence === 'refund')
    return { kind: 'review', reason: 'Review the refund against its original entry.' };
  if (evidence === 'incomplete')
    return { kind: 'review', reason: 'The message does not establish a completed movement.' };
  if (evidence === 'transfer') {
    if (
      accounts.accountIds.length === 2 &&
      accounts.outgoingAccountId &&
      accounts.incomingAccountId &&
      accounts.outgoingAccountId !== accounts.incomingAccountId &&
      accounts.accountIds.includes(accounts.outgoingAccountId) &&
      accounts.accountIds.includes(accounts.incomingAccountId) &&
      direction !== 'unknown'
    ) {
      return {
        kind: 'transfer',
        sourceAccountId: accounts.outgoingAccountId,
        destinationAccountId: accounts.incomingAccountId,
      };
    }
    return { kind: 'review', reason: 'Resolve both sides of this transfer.' };
  }
  if (accounts.accountIds.length !== 1)
    return { kind: 'review', reason: 'Resolve the financial account.' };
  const id = accounts.accountIds[0];
  if (evidence === 'purchase' && direction === 'debit' && !accounts.incomingAccountId)
    return { kind: 'expense', sourceAccountId: id };
  if (evidence === 'salary' && direction === 'credit' && !accounts.outgoingAccountId)
    return { kind: 'income', sourceAccountId: id };
  return { kind: 'review', reason: 'Review whether this is spending, income, or a transfer.' };
}
