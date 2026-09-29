import { auditRepository } from '@/src/data/repositories/AuditRepository';
import AuditLog from '@/src/data/models/AuditLog';
import { sharingService, ShareFormat } from '@/src/services/SharingService';
import type { WorkplaceId } from '@/src/types/ids';
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

const ARCHIVE_PAGE_SIZE = 200;
const ARCHIVE_MIME_TYPE = 'application/x-ndjson';
const ARCHIVE_PROVIDER = {
  id: 'audit-history-archive',
  title: 'Audit history archive',
};

type BrowserArchiveWritable = {
  write: (chunk: string) => Promise<void>;
  close: () => Promise<void>;
  abort?: () => Promise<void>;
};

type BrowserArchiveHandle = {
  createWritable: () => Promise<BrowserArchiveWritable>;
};

type WindowWithSavePicker = Window & {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<BrowserArchiveHandle>;
};

function archiveFilename(timestamp: number): string {
  const stamp = new Date(timestamp).toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `full-frills-audit-history-${stamp}.jsonl`;
}

function toArchiveRecord(log: AuditLog): Record<string, unknown> {
  const changes = log.parsedChanges;
  return {
    recordType: 'event',
    id: log.id,
    entityType: log.entityType,
    entityId: log.entityId,
    action: log.action,
    timestamp: log.timestamp,
    createdAt: log.createdAt.toISOString(),
    source: log.source ?? changes?.source ?? null,
    eventType: log.eventType ?? changes?.eventType ?? null,
    actor: changes?.actor ?? null,
    correlationId: log.correlationId ?? changes?.correlationId ?? null,
    revertsLogId: changes?.revertsLogId ?? null,
    undoable: changes?.undoable ?? null,
    // Keep the raw JSON text so legacy and future payloads survive without reinterpretation.
    changes: log.changes,
  };
}

function line(record: Record<string, unknown>): string {
  return `${JSON.stringify(record)}\n`;
}

function requestBrowserWriter(filename: string): Promise<BrowserArchiveWritable> | null {
  if (typeof window === 'undefined') return null;
  const savePicker = (window as WindowWithSavePicker).showSaveFilePicker;
  if (!savePicker) return null;
  return savePicker.call(window, {
    suggestedName: filename,
    types: [
      {
        description: 'Audit history archive',
        accept: { [ARCHIVE_MIME_TYPE]: ['.jsonl'] },
      },
    ],
  }).then(handle => handle.createWritable());
}

/** Writes the complete current-workplace history as a versioned, read-only JSONL archive. */
export async function exportAuditHistoryArchive(
  workplaceId: WorkplaceId,
  onProgress?: (exportedCount: number, totalAtStart: number) => void,
): Promise<void> {
  const requestedAt = Date.now();
  const filename = archiveFilename(requestedAt);
  const nativeFile =
    Platform.OS === 'web' ? null : new File(Paths.cache, filename);
  const browserWriterPromise =
    Platform.OS === 'web' ? requestBrowserWriter(filename) : null;
  const webChunks: string[] = [];
  let browserWriter: BrowserArchiveWritable | undefined;
  let exportedCount = 0;
  let newestTimestamp: number | null = null;
  let oldestTimestamp: number | null = null;
  let highWater: { timestamp: number; id: string } | undefined;
  let nativeFileShared = false;
  let browserFileSaved = false;

  try {
    if (nativeFile) nativeFile.create({ overwrite: true });
    if (browserWriterPromise) browserWriter = await browserWriterPromise;

    const exportStartedAt = Date.now();
    const totalAtStart = await auditRepository.countByWorkplace(workplaceId);
    const append = async (content: string) => {
      if (nativeFile) nativeFile.write(content, { append: true });
      else if (browserWriter) await browserWriter.write(content);
      else webChunks.push(content);
    };
    const writeFirst = (content: string) => {
      if (nativeFile) nativeFile.write(content);
      else if (browserWriter) return browserWriter.write(content);
      else webChunks.push(content);
    };

    await writeFirst(
      line({
        recordType: 'manifest',
        format: 'full-frills-audit-history',
        formatVersion: 1,
        purpose: 'Read-only archive; use a full backup to restore app data.',
        exportedAt: new Date(exportStartedAt).toISOString(),
        workplaceId,
        order: 'timestamp-descending-then-id-descending',
        changesEncoding: 'raw-json-text',
      }),
    );

    let cursor: { timestamp: number; id: string } | undefined;
    while (true) {
      const page = await auditRepository.findAll(workplaceId, {
        cursor,
        until: highWater,
        limit: ARCHIVE_PAGE_SIZE,
      });
      if (page.length === 0) break;

      const first = page[0];
      const last = page[page.length - 1];
      if (!highWater && first) highWater = { timestamp: first.timestamp, id: first.id };
      if (newestTimestamp === null && first) newestTimestamp = first.timestamp;
      if (last) oldestTimestamp = last.timestamp;

      await append(page.map(log => line(toArchiveRecord(log))).join(''));
      exportedCount += page.length;
      onProgress?.(exportedCount, totalAtStart);

      if (page.length < ARCHIVE_PAGE_SIZE || !last) break;
      cursor = { timestamp: last.timestamp, id: last.id };
    }

    await append(
      line({
        recordType: 'complete',
        entryCount: exportedCount,
        newestTimestamp,
        oldestTimestamp,
        highWater,
      }),
    );

    if (nativeFile) {
      await sharingService.shareFile(ARCHIVE_PROVIDER, nativeFile.uri, ARCHIVE_MIME_TYPE);
      nativeFileShared = true;
    } else if (browserWriter) {
      await browserWriter.close();
      browserFileSaved = true;
    } else {
      await sharingService.share(
        {
          ...ARCHIVE_PROVIDER,
          filename: filename.replace(/\.jsonl$/, ''),
          fileExtension: 'jsonl',
          mimeType: ARCHIVE_MIME_TYPE,
          getContent: () => webChunks.join(''),
        },
        ShareFormat.TEXT,
      );
    }
  } catch (error) {
    if (browserWriter && !browserFileSaved) await browserWriter.abort?.().catch(() => undefined);
    throw error;
  } finally {
    if (nativeFile && !nativeFileShared && nativeFile.exists) nativeFile.delete();
  }
}
