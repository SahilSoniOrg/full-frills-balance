import { transactionCaptureStrings as strings } from '@/src/constants/copy/domains/transactionCaptureStrings';
import { parseCaptureDescriptionKey } from '@/src/domain/transaction-intelligence/descriptionDefaults';
import type { CaptureReviewItem } from '@/src/services/transaction-intelligence/captureReviewService';

/** Resolves display and search scope fields from a candidate's serialized description key. */
export function descriptionScope(
  item: Pick<CaptureReviewItem, 'descriptionDefaultKey' | 'currencyCode'>,
) {
  const parsed = parseCaptureDescriptionKey(item.descriptionDefaultKey);
  return {
    amount: parsed?.amount,
    currencyCode: parsed?.currencyCode ?? item.currencyCode,
    kind: parsed?.kind ?? strings.unknownType,
  };
}
