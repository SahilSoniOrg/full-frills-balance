import { database } from '@/src/data/database/Database';
import Journal from '@/src/data/models/Journal';
import { JournalId, WorkplaceId } from '@/src/types/ids';
import { Q } from '@nozbe/watermelondb';

/** Read-only journal lookups by id (persistence intent). */
export class JournalQueryRepository {
  private get journals() {
    return database.collections.get<Journal>('journals');
  }

  async find(workplaceId: WorkplaceId, id: JournalId): Promise<Journal | null> {
    try {
      const journal = await this.journals.find(id);
      if (journal.deletedAt) return null;
      if (journal.workplaceId !== workplaceId) return null;
      return journal;
    } catch {
      return null;
    }
  }

  async findWithDeleted(workplaceId: WorkplaceId, id: JournalId): Promise<Journal | null> {
    try {
      const journal = await this.journals.find(id);
      if (journal.workplaceId !== workplaceId) return null;
      return journal;
    } catch {
      return null;
    }
  }

  async findByIds(workplaceId: WorkplaceId, ids: JournalId[]): Promise<Journal[]> {
    if (ids.length === 0) return [];
    const results: Journal[] = [];
    const CHUNK_SIZE = 100;
    for (let index = 0; index < ids.length; index += CHUNK_SIZE) {
      const chunk = ids.slice(index, index + CHUNK_SIZE);
      const journals = await this.journals
        .query(
          Q.where('id', Q.oneOf(chunk)),
          Q.where('deleted_at', Q.eq(null)),
          Q.where('workplace_id', workplaceId),
        )
        .fetch();
      results.push(...journals);
    }
    return results;
  }

  async findWithDeletedByIds(workplaceId: WorkplaceId, ids: JournalId[]): Promise<Journal[]> {
    if (ids.length === 0) return [];
    return this.journals
      .query(Q.where('id', Q.oneOf(ids)), Q.where('workplace_id', workplaceId))
      .fetch();
  }

  async findRecentByDescription(
    workplaceId: WorkplaceId,
    keyword: string,
    limit: number,
  ): Promise<Journal[]> {
    return this.journals
      .query(
        Q.where('workplace_id', workplaceId),
        Q.where('deleted_at', Q.eq(null)),
        Q.where('description', Q.like(`%${Q.sanitizeLikeString(keyword)}%`)),
        Q.sortBy('journal_date', Q.desc),
        Q.take(limit),
      )
      .fetch();
  }

  async findRecentPosted(workplaceId: WorkplaceId, limit: number): Promise<Journal[]> {
    return this.journals
      .query(
        Q.where('workplace_id', workplaceId),
        Q.where('deleted_at', Q.eq(null)),
        Q.where('status', 'POSTED'),
        Q.sortBy('journal_date', Q.desc),
        Q.take(limit),
      )
      .fetch();
  }
}

export const journalQueryRepository = new JournalQueryRepository();
