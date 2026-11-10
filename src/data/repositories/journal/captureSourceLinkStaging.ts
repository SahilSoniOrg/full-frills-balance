import { database } from '@/src/data/database/Database';
import Journal from '@/src/data/models/Journal';
import JournalMetadata from '@/src/data/models/JournalMetadata';
import type { CaptureSourceObservation } from '@/src/domain/transaction-intelligence/captureMetadata';
import { readCaptureMetadata } from '@/src/domain/transaction-intelligence/captureMetadata';
import {
  addJournalCaptureSources,
  hasJournalCaptureMetadataWrite,
  stageJournalCaptureMetadataWrite,
  type AccountingWriteSession,
} from '@/src/data/repositories/AccountingWriteSession';
import { applyJournalMetadataProjections } from '@/src/data/repositories/journal/journalMetadataProjections';
import type { JournalId, WorkplaceId } from '@/src/types/ids';
import { Q } from '@nozbe/watermelondb';

/** Adds source evidence to the session accumulator; the session emits one metadata write per row. */
export async function stageLinkedCaptureSource(
  session: AccountingWriteSession,
  workplaceId: WorkplaceId,
  journalId: JournalId,
  source: CaptureSourceObservation,
): Promise<void> {
  addJournalCaptureSources(session, workplaceId, journalId, [source]);
  if (hasJournalCaptureMetadataWrite(session, workplaceId, journalId)) return;

  // Same-session creates are not queryable yet; sources stay on the accumulator for any
  // writer already staged by put. Linking without existing capture metadata is a no-op write.
  const journals = await database.collections
    .get<Journal>('journals')
    .query(
      Q.where('id', journalId),
      Q.where('workplace_id', workplaceId),
      Q.where('deleted_at', Q.eq(null)),
    )
    .fetch();
  if (journals.length === 0) return;

  const rows = await database.collections
    .get<JournalMetadata>('journal_metadata')
    .query(Q.where('journal_id', journalId), Q.where('workplace_id', workplaceId))
    .fetch();
  const metadata = rows.find(row => readCaptureMetadata(row.metadataJson));
  if (!metadata) return;

  stageJournalCaptureMetadataWrite(
    session,
    workplaceId,
    journalId,
    metadata.id,
    metadata.metadataJson,
    metadataJson => [
      metadata.prepareUpdate(record => {
        record.metadataJson = metadataJson;
        applyJournalMetadataProjections(record);
        record.updatedAt = new Date();
      }),
    ],
  );
}
