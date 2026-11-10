import type JournalMetadata from '@/src/data/models/JournalMetadata';
import { readCaptureMetadata } from '@/src/domain/transaction-intelligence/captureMetadata';
import { readHistoricalSmsEvidence } from '@/src/domain/transaction-intelligence/historicalSmsEvidence';
import { referenceNumberFromMetadataJson } from '@/src/utils/sms/SmsReferenceExtractor';

/**
 * Keep queryable journal_metadata columns aligned with metadata_json.
 * JSON remains the audit payload; columns are the indexable projection.
 */
export function applyJournalMetadataProjections(
  record: Pick<
    JournalMetadata,
    'metadataJson' | 'referenceNumber' | 'captureReviewState' | 'hasHistoricalSmsEvidence'
  >,
): void {
  const json = record.metadataJson;
  record.referenceNumber = referenceNumberFromMetadataJson(json);
  record.captureReviewState = readCaptureMetadata(json)?.reviewState;
  record.hasHistoricalSmsEvidence = readHistoricalSmsEvidence(json) ? true : undefined;
}
