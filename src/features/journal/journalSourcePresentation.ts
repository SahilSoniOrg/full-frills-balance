import { AppConfig } from '@/src/constants';
import {
  mapSmsJournalMetadataDisplay,
  type SmsJournalInfoDisplay,
} from '@/src/services/journal/journalDetailsHelpers';
import type { InboxRecordSnapshot } from '@/src/types/smsInbox';
import { formatDate } from '@/src/utils/dateUtils';

export interface JournalImportSource {
  name: string;
  date: string;
}

/** SMS wins over a generic import marker; journals people typed in have no source at all. */
export interface JournalSourceInfo {
  sms?: SmsJournalInfoDisplay[];
  import?: JournalImportSource;
}

interface SourceMetadata {
  importSource?: string;
  originalSmsSender?: string;
  originalSmsBody?: string;
  metadataJson?: string;
  createdAt: Date;
}

const NON_IMPORT_SOURCES = ['manual', 'manual_post', 'planned_payment'];

export function formatImportSource(source: string): string {
  const labels: Record<string, string> = AppConfig.strings.journalDetails.importSources;
  const key = source.toLowerCase();
  if (labels[key]) return labels[key];
  const words = key.replace(/[_-]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function buildJournalSource(
  metadata: SourceMetadata | null,
  inboxRecords: readonly InboxRecordSnapshot[],
): JournalSourceInfo {
  if (inboxRecords.length > 0 || metadata?.originalSmsBody || metadata?.importSource === 'sms') {
    const records =
      inboxRecords.length > 0
        ? [...inboxRecords].sort((a, b) => b.inputDate - a.inputDate)
        : [null];
    return {
      sms: records.map((inboxRecord, index) =>
        mapSmsJournalMetadataDisplay({
          originalSmsSender: index === 0 ? metadata?.originalSmsSender : undefined,
          originalSmsBody: index === 0 ? metadata?.originalSmsBody : undefined,
          metadataJson: index === 0 ? metadata?.metadataJson : undefined,
          inboxRecord,
        }),
      ),
    };
  }
  if (!metadata?.importSource || NON_IMPORT_SOURCES.includes(metadata.importSource)) return {};
  return {
    import: {
      name: formatImportSource(metadata.importSource),
      date: formatDate(metadata.createdAt.getTime()),
    },
  };
}
