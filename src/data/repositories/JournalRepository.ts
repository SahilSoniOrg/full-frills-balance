import { database } from '@/src/data/database/Database';
import { AccountType } from '@/src/data/models/Account';
import Journal, { JournalStatus } from '@/src/data/models/Journal';
import JournalMetadata from '@/src/data/models/JournalMetadata';
import Transaction, { TransactionType } from '@/src/data/models/Transaction';
import { journalEnrichmentQueries } from '@/src/data/repositories/journal/JournalEnrichmentQueries';
import { journalListQueryRepository } from '@/src/data/repositories/journal/journalListQueryRepository';
import { journalMetadataRepository } from '@/src/data/repositories/journal/journalMetadataRepository';
import { journalObserveQueries } from '@/src/data/repositories/journal/JournalObserveQueries';
import { journalPlannedQueries } from '@/src/data/repositories/journal/JournalPlannedQueries';
import { journalQueryRepository } from '@/src/data/repositories/journal/journalQueryRepository';
import {
  journalWriteRepository,
  type PrepareCreateJournalData,
} from '@/src/data/repositories/journal/journalWriteRepository';
import { smsJournalQueries } from '@/src/data/repositories/journal/SmsJournalQueries';
import { AccountId, JournalId, PlannedPaymentId, WorkplaceId } from '@/src/types/domain';
import { Model, Q } from '@nozbe/watermelondb';

export type {
  CreateJournalData,
  PrepareCreateJournalData,
} from '@/src/data/repositories/journal/journalWriteRepository';

export class JournalRepository {
  private get journals() {
    return database.collections.get<Journal>('journals');
  }

  journalsQuery(...clauses: Q.Clause[]) {
    return this.journals.query(Q.where('deleted_at', Q.eq(null)), ...clauses);
  }

  observeByIdsWithDeleted(workplaceId: WorkplaceId, journalIds: JournalId[]) {
    return journalObserveQueries.observeByIdsWithDeleted(workplaceId, journalIds);
  }

  observeAccountTransactions(
    workplaceId: WorkplaceId,
    accountId: AccountId,
    limit: number,
    dateRange?: { startDate: number; endDate: number },
  ) {
    return journalObserveQueries.observeAccountTransactions(
      workplaceId,
      accountId,
      limit,
      dateRange,
    );
  }

  observeById(workplaceId: WorkplaceId, journalId: string, includeDeleted: boolean = false) {
    return journalObserveQueries.observeById(workplaceId, journalId, includeDeleted);
  }

  observeByIds(workplaceId: WorkplaceId, journalIds: JournalId[]) {
    return journalObserveQueries.observeByIds(workplaceId, journalIds);
  }

  observeStatusMeta(workplaceId: WorkplaceId) {
    return journalObserveQueries.observeStatusMeta(workplaceId);
  }

  observePlannedInRange(workplaceId: WorkplaceId, startDate: number, endDate: number) {
    return journalObserveQueries.observePlannedInRange(workplaceId, startDate, endDate);
  }

  findEarliestPlannedByPayment(workplaceId: WorkplaceId, plannedPaymentId: PlannedPaymentId) {
    return journalPlannedQueries.findEarliestPlannedByPayment(workplaceId, plannedPaymentId);
  }

  findPlannedOnDay(
    workplaceId: WorkplaceId,
    plannedPaymentId: PlannedPaymentId,
    dayStart: number,
    dayEnd: number,
  ) {
    return journalPlannedQueries.findPlannedOnDay(workplaceId, plannedPaymentId, dayStart, dayEnd);
  }

  findByPlannedPaymentIds(workplaceId: WorkplaceId, plannedPaymentIds: PlannedPaymentId[]) {
    return journalPlannedQueries.findByPlannedPaymentIds(workplaceId, plannedPaymentIds);
  }

  countOnDayByPlannedPayment(
    workplaceId: WorkplaceId,
    plannedPaymentId: PlannedPaymentId,
    dayStart: number,
    dayEnd: number,
  ) {
    return journalPlannedQueries.countOnDay(workplaceId, plannedPaymentId, dayStart, dayEnd);
  }

  findByPlannedPaymentAndStatus(
    workplaceId: WorkplaceId,
    plannedPaymentId: PlannedPaymentId,
    status: JournalStatus,
  ) {
    return journalPlannedQueries.findByPlannedPaymentAndStatus(
      workplaceId,
      plannedPaymentId,
      status,
    );
  }

  preparePlannedStatusUpdates(journals: Journal[], status: JournalStatus) {
    return journalPlannedQueries.prepareStatusUpdates(journals, status);
  }

  batchUpdatePlannedStatus(journals: Journal[], status: JournalStatus) {
    return journalPlannedQueries.batchUpdateStatus(journals, status);
  }

  /**
   * PURE PERSISTENCE METHODS
   */

  async find(workplaceId: WorkplaceId, id: JournalId): Promise<Journal | null> {
    return journalQueryRepository.find(workplaceId, id);
  }

  async findWithDeleted(workplaceId: WorkplaceId, id: JournalId): Promise<Journal | null> {
    return journalQueryRepository.findWithDeleted(workplaceId, id);
  }

  async findByIds(workplaceId: WorkplaceId, ids: JournalId[]): Promise<Journal[]> {
    return journalQueryRepository.findByIds(workplaceId, ids);
  }

  async findAll(workplaceId: WorkplaceId): Promise<Journal[]> {
    return journalListQueryRepository.findAll(workplaceId);
  }

  async findAllPlanned(workplaceId: WorkplaceId): Promise<Journal[]> {
    return journalListQueryRepository.findAllPlanned(workplaceId);
  }

  async findAllNonDeleted(workplaceId: WorkplaceId): Promise<Journal[]> {
    return journalListQueryRepository.findAllNonDeleted(workplaceId);
  }

  async findMetadataByJournalId(
    journalId: string,
    workplaceId: WorkplaceId,
  ): Promise<JournalMetadata | null> {
    return journalMetadataRepository.findByJournalId(journalId, workplaceId);
  }

  async patchMetadata(
    workplaceId: WorkplaceId,
    journalId: JournalId,
    partialMetadata: Record<string, unknown>,
    source?: string,
  ): Promise<void> {
    return journalMetadataRepository.patch(workplaceId, journalId, partialMetadata, source);
  }

  async prepareMetadataPatch(
    workplaceId: WorkplaceId,
    journalId: JournalId,
    partialMetadata: Record<string, unknown>,
    source?: string,
  ): Promise<Model> {
    return journalMetadataRepository.preparePatch(workplaceId, journalId, partialMetadata, source);
  }

  async findJournalByOriginalSmsId(
    originalSmsId: string,
    workplaceId: WorkplaceId,
  ): Promise<Journal | null> {
    return smsJournalQueries.findJournalByOriginalSmsId(originalSmsId, workplaceId);
  }

  async findJournalsByOriginalSmsIds(
    smsIds: string[],
    workplaceId: WorkplaceId,
  ): Promise<Map<string, Journal>> {
    return smsJournalQueries.findJournalsByOriginalSmsIds(smsIds, workplaceId);
  }

  async findJournalBySmsFingerprint(
    smsFingerprint: string,
    workplaceId: WorkplaceId,
  ): Promise<Journal | null> {
    return smsJournalQueries.findJournalBySmsFingerprint(smsFingerprint, workplaceId);
  }

  async findJournalsBySmsFingerprints(
    fingerprints: string[],
    workplaceId: WorkplaceId,
  ): Promise<Map<string, Journal>> {
    return smsJournalQueries.findJournalsBySmsFingerprints(fingerprints, workplaceId);
  }

  async findNearbyJournals(
    params: {
      centerDate: number;
      windowMs: number;
      amount?: number;
      amounts?: number[];
      excludeJournalId?: string;
      limit?: number;
    },
    workplaceId: WorkplaceId,
  ): Promise<Journal[]> {
    return smsJournalQueries.findNearbyJournals(params, workplaceId);
  }

  async countNonDeleted(workplaceId: WorkplaceId): Promise<number> {
    return journalListQueryRepository.countNonDeleted(workplaceId);
  }

  prepareCreateJournalWithTransactions(
    journalData: PrepareCreateJournalData,
    workplaceId: WorkplaceId,
  ): {
    journal: Journal;
    transactions: Transaction[];
    metadataRecord?: JournalMetadata;
  } {
    return journalWriteRepository.prepareCreateJournalWithTransactions(journalData, workplaceId);
  }

  async createJournalWithTransactions(
    journalData: PrepareCreateJournalData,
    workplaceId: WorkplaceId,
  ): Promise<Journal> {
    return journalWriteRepository.createJournalWithTransactions(journalData, workplaceId);
  }

  async updateJournalWithTransactions(
    workplaceId: WorkplaceId,
    journalId: JournalId,
    journalData: PrepareCreateJournalData,
    extraOpCreator?: () => Model,
    afterBatch?: () => void,
  ): Promise<Journal> {
    return journalWriteRepository.updateJournalWithTransactions(
      workplaceId,
      journalId,
      journalData,
      extraOpCreator,
      afterBatch,
    );
  }

  async updateJournalStatus(
    journalId: JournalId,
    status: JournalStatus,
    workplaceId: WorkplaceId,
  ): Promise<Journal> {
    return journalWriteRepository.updateJournalStatus(journalId, status, workplaceId);
  }

  async softDeleteJournal(workplaceId: WorkplaceId, journalId: JournalId): Promise<void> {
    return journalWriteRepository.softDeleteJournal(workplaceId, journalId);
  }

  async fetchJournalForDeletion(
    journalId: JournalId,
    workplaceId: WorkplaceId,
  ): Promise<{ journal: Journal; transactions: Transaction[] } | null> {
    return journalWriteRepository.fetchJournalForDeletion(journalId, workplaceId);
  }

  async markReversed(
    originalJournalId: JournalId,
    reversingJournalId: JournalId,
    workplaceId: WorkplaceId,
  ): Promise<void> {
    return journalWriteRepository.markReversed(originalJournalId, reversingJournalId, workplaceId);
  }

  async replaceJournalWithReversal(params: {
    originalJournal: Journal;
    originalTransactions: Transaction[];
    replacementData: PrepareCreateJournalData;
    workplaceId: WorkplaceId;
  }): Promise<{ reversalJournal: Journal; replacementJournal: Journal }> {
    return journalWriteRepository.replaceJournalWithReversal(params);
  }

  async getRecentUniqueDescriptions(
    workplaceId: WorkplaceId,
    limit: number = 500,
  ): Promise<{ description: string; count: number }[]> {
    return journalListQueryRepository.getRecentUniqueDescriptions(workplaceId, limit);
  }

  async getEnrichmentDataRaw(journalIds: string[]): Promise<
    {
      journal_id: JournalId;
      account_id: AccountId;
      amount: number;
      transaction_type: TransactionType;
      account_name: string;
      account_type: AccountType;
      account_icon?: string;
    }[]
  > {
    return journalEnrichmentQueries.getEnrichmentDataRaw(journalIds);
  }
}

export { journalQueryRepository } from '@/src/data/repositories/journal/journalQueryRepository';
export { journalListQueryRepository } from '@/src/data/repositories/journal/journalListQueryRepository';
export { journalWriteRepository } from '@/src/data/repositories/journal/journalWriteRepository';

export const journalRepository = new JournalRepository();
