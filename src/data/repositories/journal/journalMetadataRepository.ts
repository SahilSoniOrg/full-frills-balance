import { database } from '@/src/data/database/Database';
import JournalMetadata from '@/src/data/models/JournalMetadata';
import { WorkplaceId } from '@/src/types/ids';
import { Q } from '@nozbe/watermelondb';

/** Reads journal metadata for display and lifecycle queries. */
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
}

export const journalMetadataRepository = new JournalMetadataRepository();
