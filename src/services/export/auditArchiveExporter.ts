import { auditRepository } from '@/src/data/repositories/AuditRepository';
import AuditLog from '@/src/data/models/AuditLog';
import { throwIfShareAborted } from '@/src/services/sharing/sharingCancellation';
import { ShareFormat, type SharePreparationContext, type Shareable } from '@/src/types/sharing';
import type { WorkplaceId } from '@/src/types/ids';
import { createTextExportWriter } from './textExportWriter';

const ARCHIVE_PAGE_SIZE = 200;
const ARCHIVE_MIME_TYPE = 'application/x-ndjson';
const ARCHIVE_PROVIDER = {
  id: 'audit-history-archive',
  title: 'Audit history archive',
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

/** Describes a complete current-workplace history as a versioned, read-only JSONL archive. */
export function createAuditArchiveShareable(
  workplaceId: WorkplaceId,
  onProgress?: (exportedCount: number, totalAtStart: number) => void,
): Shareable {
  const requestedAt = Date.now();
  const filename = archiveFilename(requestedAt);

  return {
    ...ARCHIVE_PROVIDER,
    filename: filename.replace(/\.jsonl$/, ''),
    mimeType: ARCHIVE_MIME_TYPE,
    fileExtension: 'jsonl',
    supportedFormats: [ShareFormat.TEXT],
    scope: { kind: 'workplace', workplaceId },
    requireFile: true,
    preferStreaming: true,
    async prepare(format: ShareFormat, context: SharePreparationContext) {
      if (format !== ShareFormat.TEXT) {
        throw new Error(`Unsupported audit archive format: ${format}`);
      }

      const operationFilename = archiveFilename(Date.now()).replace(
        '.jsonl',
        `-${Math.random().toString(36).slice(2, 8)}.jsonl`,
      );
      const writer = createTextExportWriter(operationFilename, ARCHIVE_MIME_TYPE, context);
      let exportedCount = 0;
      let newestTimestamp: number | null = null;
      let oldestTimestamp: number | null = null;
      let highWater: { timestamp: number; id: string } | undefined;

      try {
        throwIfShareAborted(context.signal);
        const totalAtStart = await auditRepository.countByWorkplace(workplaceId);
        throwIfShareAborted(context.signal);

        const exportStartedAt = Date.now();
        await writer.write(
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
          throwIfShareAborted(context.signal);
          const page = await auditRepository.findAll(workplaceId, {
            cursor,
            until: highWater,
            limit: ARCHIVE_PAGE_SIZE,
          });
          throwIfShareAborted(context.signal);
          if (page.length === 0) break;

          const first = page[0];
          const last = page[page.length - 1];
          if (!highWater && first) highWater = { timestamp: first.timestamp, id: first.id };
          if (newestTimestamp === null && first) newestTimestamp = first.timestamp;
          if (last) oldestTimestamp = last.timestamp;

          // Serialize each row independently to retain the existing JSONL schema and ordering.
          const pageContent = page.map(log => line(toArchiveRecord(log))).join('');
          await writer.write(pageContent);
          exportedCount += page.length;
          onProgress?.(exportedCount, totalAtStart);
          const fraction = totalAtStart > 0 ? Math.min(exportedCount / totalAtStart, 1) : 1;
          context.reportProgress(`${exportedCount} of ${totalAtStart} audit entries`, fraction);

          if (page.length < ARCHIVE_PAGE_SIZE || !last) break;
          cursor = { timestamp: last.timestamp, id: last.id };
        }

        await writer.write(
          line({
            recordType: 'complete',
            entryCount: exportedCount,
            newestTimestamp,
            oldestTimestamp,
            highWater,
          }),
        );

        return writer.getArtifact();
      } catch (error) {
        writer.cleanup();
        throw error;
      }
    },
  };
}
