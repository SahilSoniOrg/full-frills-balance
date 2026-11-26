import { useEffect, useState } from 'react';
import { logger } from '@/src/services/observability/logger';
import { smsService } from '@/src/services/sms-service';
import type { JournalId, WorkplaceId } from '@/src/types/ids';
import type { PlainInboxRecord } from '@/src/types/plainDtos';

export interface UseInboxSourceRecordsParams {
  workplaceId: WorkplaceId;
  smsRecordId?: string;
  journalId?: JournalId;
  isEdit: boolean;
}

/** Loads linked inbox source records scoped to the active workplace and target draft/journal. */
export function useInboxSourceRecords({
  workplaceId,
  smsRecordId,
  journalId,
  isEdit,
}: UseInboxSourceRecordsParams): PlainInboxRecord[] {
  const editJournalId = isEdit ? journalId : undefined;
  const lookupKey = !workplaceId
    ? undefined
    : smsRecordId
      ? `${workplaceId}:record:${smsRecordId}`
      : editJournalId
        ? `${workplaceId}:journal:${editJournalId}`
        : undefined;

  const [lookup, setLookup] = useState<{
    key: string;
    items: PlainInboxRecord[];
  } | null>(null);

  useEffect(() => {
    if (!lookupKey) return;
    let isActive = true;
    const loadInboxItems = async () => {
      try {
        const items = smsRecordId
          ? [await smsService.findInboxRecord(workplaceId, smsRecordId)].filter(
              (item): item is PlainInboxRecord => item !== null,
            )
          : editJournalId
            ? await smsService.findAllByLinkedJournalId(workplaceId, editJournalId)
            : [];
        if (isActive) setLookup({ key: lookupKey, items });
      } catch (error) {
        logger.warn('[useInboxSourceRecords] Failed to load inbox source records', { error });
        if (isActive) setLookup({ key: lookupKey, items: [] });
      }
    };
    void loadInboxItems();
    return () => {
      isActive = false;
    };
  }, [editJournalId, lookupKey, smsRecordId, workplaceId]);

  return lookup && lookup.key === lookupKey ? lookup.items : [];
}
