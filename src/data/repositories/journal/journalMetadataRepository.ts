import { database } from '@/src/data/database/Database';
import JournalMetadata from '@/src/data/models/JournalMetadata';
import { JournalId, WorkplaceId } from '@/src/types/domain';
import { safeParseJSON } from '@/src/utils/serialization';
import { Model, Q } from '@nozbe/watermelondb';

/** Journal metadata persistence (import source, SMS fields, JSON blob). */
export class JournalMetadataRepository {
  private get journalMetadata() {
    return database.collections.get<JournalMetadata>('journal_metadata');
  }

  async findByJournalId(
    journalId: string,
    workplaceId: WorkplaceId,
  ): Promise<JournalMetadata | null> {
    const records = await this.journalMetadata
      .query(Q.where('journal_id', journalId), Q.where('workplace_id', workplaceId))
      .fetch();

    return records[0] || null;
  }

  /**
   * Updates or creates metadata for a journal, merging existing metadata JSON.
   * Assumes it's being called inside a database.write() block.
   */
  async patch(
    workplaceId: WorkplaceId,
    journalId: JournalId,
    partialMetadata: Record<string, unknown>,
    source?: string,
  ): Promise<void> {
    const existingMeta = await this.findByJournalId(journalId, workplaceId);
    if (existingMeta) {
      await existingMeta.update((record: JournalMetadata) => {
        const currentJson = safeParseJSON<Record<string, unknown>>(record.metadataJson, {});
        record.metadataJson = JSON.stringify({ ...currentJson, ...partialMetadata });
        if (source) record.importSource = source;
        record.updatedAt = new Date();
      });
    } else {
      await this.journalMetadata.create((record: JournalMetadata) => {
        record.journalId = journalId;
        record.workplaceId = workplaceId;
        record.importSource = source || 'manual';
        record.metadataJson = JSON.stringify(partialMetadata);
        record.createdAt = new Date();
        record.updatedAt = new Date();
      });
    }
  }

  /**
   * Prepare-only version of patch.
   *
   * Returns a prepareUpdate / prepareCreate model op that can be included in
   * a parent database.batch() call WITHOUT opening its own write transaction.
   */
  async preparePatch(
    workplaceId: WorkplaceId,
    journalId: JournalId,
    partialMetadata: Record<string, unknown>,
    source?: string,
  ): Promise<Model> {
    const existingMeta = await this.findByJournalId(journalId, workplaceId);
    if (existingMeta) {
      return existingMeta.prepareUpdate((record: JournalMetadata) => {
        const currentJson = safeParseJSON<Record<string, unknown>>(record.metadataJson, {});
        record.metadataJson = JSON.stringify({ ...currentJson, ...partialMetadata });
        if (source) record.importSource = source;
        record.updatedAt = new Date();
      });
    }
    return this.journalMetadata.prepareCreate((record: JournalMetadata) => {
      record.journalId = journalId;
      record.workplaceId = workplaceId;
      record.importSource = source || 'manual';
      record.metadataJson = JSON.stringify(partialMetadata);
      record.createdAt = new Date();
      record.updatedAt = new Date();
    });
  }
}

export const journalMetadataRepository = new JournalMetadataRepository();
