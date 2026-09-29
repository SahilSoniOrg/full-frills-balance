import { database } from '@/src/data/database/Database';
import Journal from '@/src/data/models/Journal';
import { JournalStatus } from '@/src/types/enums';
import { JournalId, WorkplaceId } from '@/src/types/ids';
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus';
import { logger } from '@/src/utils/logger';
import { Q } from '@nozbe/watermelondb';
import { fetchSequentiallyInChunks } from '../fetchSequentiallyInChunks';

/** Workplace-scoped reads for persisted journals. */
export class JournalQueryRepository {
  private get journals() {
    return database.collections.get<Journal>('journals');
  }

  private nonDeletedQuery(workplaceId: WorkplaceId, ...clauses: Q.Clause[]) {
    return this.journals.query(
      Q.where('deleted_at', Q.eq(null)),
      Q.where('workplace_id', workplaceId),
      ...clauses,
    );
  }

  private scopedQuery(workplaceId: WorkplaceId, ...clauses: Q.Clause[]) {
    return this.journals.query(Q.where('workplace_id', workplaceId), ...clauses);
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
    return fetchSequentiallyInChunks(ids, chunk =>
      this.nonDeletedQuery(workplaceId, Q.where('id', Q.oneOf([...chunk]))).fetch(),
    );
  }

  async findWithDeletedByIds(workplaceId: WorkplaceId, ids: JournalId[]): Promise<Journal[]> {
    if (ids.length === 0) return [];
    return this.scopedQuery(workplaceId, Q.where('id', Q.oneOf(ids))).fetch();
  }

  async findRecentByDescription(
    workplaceId: WorkplaceId,
    keyword: string,
    limit: number,
  ): Promise<Journal[]> {
    return this.nonDeletedQuery(
      workplaceId,
      Q.where('description', Q.like(`%${Q.sanitizeLikeString(keyword)}%`)),
      Q.sortBy('journal_date', Q.desc),
      Q.take(limit),
    ).fetch();
  }

  async findRecentPosted(workplaceId: WorkplaceId, limit: number): Promise<Journal[]> {
    return this.nonDeletedQuery(
      workplaceId,
      Q.where('status', JournalStatus.POSTED),
      Q.sortBy('journal_date', Q.desc),
      Q.take(limit),
    ).fetch();
  }

  async findAllPosted(workplaceId: WorkplaceId): Promise<Journal[]> {
    return this.nonDeletedQuery(workplaceId, Q.where('status', JournalStatus.POSTED)).fetch();
  }

  async findPostedPage(
    workplaceId: WorkplaceId,
    afterJournalId: string,
    limit: number,
  ): Promise<Journal[]> {
    return this.nonDeletedQuery(
      workplaceId,
      Q.where('status', JournalStatus.POSTED),
      Q.where('id', Q.gt(afterJournalId)),
      Q.sortBy('id', Q.asc),
      Q.take(limit),
    ).fetch();
  }

  async findAll(workplaceId: WorkplaceId): Promise<Journal[]> {
    const start = Date.now();
    const results = await this.nonDeletedQuery(
      workplaceId,
      Q.where('status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
    )
      .extend(Q.sortBy('journal_date', 'desc'))
      .fetch();

    logger.info(`[Trace] JournalQueryRepository.findAll: ${Date.now() - start}ms`, {
      count: results.length,
    });
    return results;
  }

  async findAllPlanned(workplaceId: WorkplaceId): Promise<Journal[]> {
    return this.nonDeletedQuery(workplaceId, Q.where('status', JournalStatus.PLANNED)).fetch();
  }

  private findInDateRange(
    workplaceId: WorkplaceId,
    startDate: number,
    endDate: number,
    status: JournalStatus,
  ): Promise<Journal[]> {
    const clauses: Q.Clause[] = [
      Q.where('status', status),
      Q.where('journal_date', Q.lte(endDate)),
    ];
    if (startDate > 0) {
      clauses.push(Q.where('journal_date', Q.gte(startDate)));
    }
    return this.nonDeletedQuery(workplaceId, ...clauses).fetch();
  }

  async findPostedInDateRange(
    workplaceId: WorkplaceId,
    startDate: number,
    endDate: number,
  ): Promise<Journal[]> {
    return this.findInDateRange(workplaceId, startDate, endDate, JournalStatus.POSTED);
  }

  async findPlannedInDateRange(
    workplaceId: WorkplaceId,
    startDate: number,
    endDate: number,
  ): Promise<Journal[]> {
    return this.findInDateRange(workplaceId, startDate, endDate, JournalStatus.PLANNED);
  }

  async findAllNonDeleted(workplaceId: WorkplaceId): Promise<Journal[]> {
    return this.nonDeletedQuery(workplaceId).extend(Q.sortBy('journal_date', 'desc')).fetch();
  }

  async countNonDeleted(workplaceId: WorkplaceId): Promise<number> {
    return this.nonDeletedQuery(workplaceId).fetchCount();
  }
}

export const journalQueryRepository = new JournalQueryRepository();
