import {
  captureAllocationsMatchLines,
  captureConfirmationKey,
  updateCaptureAllocations,
  type CaptureCategoryLine,
  type CaptureMetadata,
} from '@/src/domain/transaction-intelligence/captureMetadata';
import { AccountType } from '@/src/types/enums';

export type CaptureTransitionActor = 'user' | 'system';

export type CaptureTransitionRejection =
  | 'missing_capture'
  | 'unauthorized_confirmation'
  | 'stale_confirmation'
  | 'uncategorized_confirmation';

export type CaptureTransitionResult =
  | { ok: true; capture: CaptureMetadata | null }
  | { ok: false; rejection: CaptureTransitionRejection };

export interface CaptureTransitionInput {
  existing: CaptureMetadata | null;
  proposedLines: readonly CaptureCategoryLine[];
  actor: CaptureTransitionActor;
  now: number;
  confirmation?: {
    key: string;
    originalLines: readonly Pick<
      CaptureCategoryLine,
      'accountId' | 'amount' | 'transactionType' | 'currencyCode'
    >[];
    posted: boolean;
  };
}

/** Purely applies a capture change and validates any explicit user confirmation. */
export function transitionCapture(input: CaptureTransitionInput): CaptureTransitionResult {
  const { existing, proposedLines, actor, now, confirmation } = input;
  if (!existing) {
    return confirmation ? { ok: false, rejection: 'missing_capture' } : { ok: true, capture: null };
  }
  let capture = updateCaptureAllocations(existing, proposedLines, actor === 'user', now);
  if (!confirmation) return { ok: true, capture };

  if (actor !== 'user' || !confirmation.posted) {
    return { ok: false, rejection: 'unauthorized_confirmation' };
  }
  if (existing.economicKind === 'transfer') {
    return { ok: false, rejection: 'uncategorized_confirmation' };
  }

  const categoryLines = proposedLines.filter(
    line => line.accountType === AccountType.EXPENSE || line.accountType === AccountType.INCOME,
  );
  const expectedType =
    capture.economicKind === 'expense' ? AccountType.EXPENSE : AccountType.INCOME;
  if (
    confirmation.key !== captureConfirmationKey(existing.allocations, confirmation.originalLines) ||
    confirmation.key !== captureConfirmationKey(existing.allocations, proposedLines) ||
    !captureAllocationsMatchLines(existing.allocations, categoryLines) ||
    capture.allocations.length === 0 ||
    !capture.allocations.some(
      allocation => allocation.origin !== 'user' || allocation.confirmedAt === undefined,
    ) ||
    capture.allocations.some(allocation => allocation.origin === 'uncategorized') ||
    categoryLines.some(line => line.accountType !== expectedType)
  ) {
    return { ok: false, rejection: 'stale_confirmation' };
  }

  capture = {
    ...capture,
    allocations: capture.allocations.map(allocation => ({
      ...allocation,
      origin: 'user',
      confirmedAt: allocation.confirmedAt ?? now,
    })),
  };
  return { ok: true, capture };
}
