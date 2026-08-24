import { database } from '@/src/data/database/Database';
import Journal from '@/src/data/models/Journal';
import { JournalStatus } from '@/src/types/enums';
import { WorkplaceId } from '@/src/types/ids';
import { journalEnrichmentQueries } from '@/src/data/repositories/journal/JournalEnrichmentQueries';
import type { JournalAutofillSuggestion } from '@/src/data/repositories/journal/journalEnrichmentTypes';
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus';
import { logger } from '@/src/utils/logger';
import { Q } from '@nozbe/watermelondb';

/** List/count queries over journals (non–single-id reads). */
export class JournalListQueryRepository {
  private get journals() {
    return database.collections.get<Journal>('journals');
  }

  private journalsQuery(...clauses: Q.Clause[]) {
    return this.journals.query(Q.where('deleted_at', Q.eq(null)), ...clauses);
  }

  async findAll(workplaceId: WorkplaceId): Promise<Journal[]> {
    const start = Date.now();
    const results = await this.journals
      .query(
        Q.where('deleted_at', Q.eq(null)),
        Q.where('status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
        Q.where('workplace_id', workplaceId),
      )
      .extend(Q.sortBy('journal_date', 'desc'))
      .fetch();

    logger.info(`[Trace] JournalListQueryRepository.findAll: ${Date.now() - start}ms`, {
      count: results.length,
    });
    return results;
  }

  async findAllPlanned(workplaceId: WorkplaceId): Promise<Journal[]> {
    return this.journalsQuery(
      Q.where('status', JournalStatus.PLANNED),
      Q.where('deleted_at', Q.eq(null)),
      Q.where('workplace_id', workplaceId),
    ).fetch();
  }

  async findAllNonDeleted(workplaceId: WorkplaceId): Promise<Journal[]> {
    return this.journals
      .query(
        Q.where('deleted_at', Q.eq(null)),
        Q.sortBy('journal_date', 'desc'),
        Q.where('workplace_id', workplaceId),
      )
      .fetch();
  }

  async countNonDeleted(workplaceId: WorkplaceId): Promise<number> {
    return this.journals
      .query(Q.where('deleted_at', Q.eq(null)), Q.where('workplace_id', workplaceId))
      .fetchCount();
  }

  async getRecentUniqueDescriptions(
    workplaceId: WorkplaceId,
    limit: number = 500,
  ): Promise<JournalAutofillSuggestion[]> {
    return journalEnrichmentQueries.getRecentUniqueDescriptions(workplaceId, limit);
  }
}

export const journalListQueryRepository = new JournalListQueryRepository();
