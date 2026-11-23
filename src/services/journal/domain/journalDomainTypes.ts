import { JournalStatus } from '@/src/types/enums';
import { JournalId } from '@/src/types/ids';
import { MetadataKeys } from '@/src/constants/ledger-constants';
import { parseJSONRecord } from '@/src/utils/serialization';
import type { CreateJournalData } from '@/src/types/journalWrite';

export interface SubmitJournalResult {
  success: boolean;
  error?: string;
  action?: 'created' | 'updated';
  journalId?: JournalId;
}

/** 'post' keeps the normal posted save; the others save a future-dated entry as PLANNED. */
export type PlannedJournalMode = 'auto' | 'manual' | 'post';

/** Future entries stay unposted; 'auto' ones are posted on their date by due processing. */
export function withPlannedStatus(
  data: CreateJournalData,
  mode?: PlannedJournalMode,
): CreateJournalData {
  if (!mode || mode === 'post' || data.journalDate <= Date.now()) return data;
  if (mode === 'manual') return { ...data, status: JournalStatus.PLANNED };
  const metadataJson = parseJSONRecord(data.metadata?.metadataJson);
  return {
    ...data,
    status: JournalStatus.PLANNED,
    metadata: {
      importSource: 'manual',
      ...data.metadata,
      metadataJson: JSON.stringify({ ...metadataJson, [MetadataKeys.AUTO_POST]: true }),
    },
  };
}
