import { deviceSmsInboxRepository } from '@/src/data/repositories/DeviceSmsInboxRepository';
import type { SmsRecognitionSummary } from '@/src/types/accountMatcher';
import type { WorkplaceId } from '@/src/types/ids';
import { safeParseJSON } from '@/src/utils/serialization';
import type { SmsWorkplaceReviewState } from '@/src/types/smsInbox';
import { AppConfig } from '@/src/constants';

/** Bounded recent recognition summaries for Account Edit attention flags. */
export async function loadRecentMatcherRecognitions(
  workplaceId: WorkplaceId,
): Promise<SmsRecognitionSummary[]> {
  const records = await deviceSmsInboxRepository.findRecent(
    AppConfig.pagination.smsImportScanLimit,
  );
  return records.flatMap(record => {
    const states = safeParseJSON<Record<string, SmsWorkplaceReviewState>>(
      record.reviewStatesJson,
      {},
    );
    const recognition = states[workplaceId]?.recognition;
    return recognition ? [recognition] : [];
  });
}
