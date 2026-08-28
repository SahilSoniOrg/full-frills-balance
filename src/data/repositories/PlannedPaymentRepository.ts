import { database } from '@/src/data/database/Database';
import PlannedPayment from '@/src/data/models/PlannedPayment';
import { PlannedPaymentInterval, PlannedPaymentStatus } from '@/src/types/enums';
import { AccountId, PlannedPaymentId, WorkplaceId } from '@/src/types/ids';
import { Model, Q } from '@nozbe/watermelondb';
import { map } from 'rxjs/operators';

export interface PlannedPaymentPersistenceInput {
  name: string;
  description?: string;
  amount: number;
  currencyCode: string;
  fromAccountId: AccountId;
  toAccountId: AccountId;
  intervalN: number;
  intervalType: PlannedPaymentInterval;
  startDate: number;
  endDate?: number;
  nextOccurrence: number;
  status: PlannedPaymentStatus;
  isAutoPost: boolean;
  recurrenceDay?: number;
  recurrenceMonth?: number;
}

export type PlannedPaymentMergeRecords = {
  sourceFrom: PlannedPayment[];
  sourceTo: PlannedPayment[];
  targetFrom: PlannedPayment[];
  targetTo: PlannedPayment[];
};

export class PlannedPaymentRepository {
  private get db() {
    return database;
  }

  private get plannedPayments() {
    return this.db.collections.get<PlannedPayment>('planned_payments');
  }

  observeAll(workplaceId: WorkplaceId) {
    return this.plannedPayments
      .query(
        Q.where('workplace_id', workplaceId),
        Q.where('deleted_at', Q.eq(null)),
        Q.sortBy('next_occurrence', Q.asc),
      )
      .observe();
  }

  observeById(workplaceId: WorkplaceId, id: PlannedPaymentId) {
    return this.plannedPayments
      .query(Q.where('workplace_id', workplaceId), Q.where('id', id))
      .observe()
      .pipe(map(results => results[0] ?? null));
  }

  observeActive(workplaceId: WorkplaceId) {
    return this.plannedPayments
      .query(
        Q.where('workplace_id', workplaceId),
        Q.where('status', PlannedPaymentStatus.ACTIVE),
        Q.where('deleted_at', Q.eq(null)),
        Q.sortBy('next_occurrence', Q.asc),
      )
      .observe();
  }

  async findAllActive(workplaceId: WorkplaceId): Promise<PlannedPayment[]> {
    return this.plannedPayments
      .query(
        Q.where('workplace_id', workplaceId),
        Q.where('status', PlannedPaymentStatus.ACTIVE),
        Q.where('deleted_at', Q.eq(null)),
      )
      .fetch();
  }

  async find(workplaceId: WorkplaceId, id: PlannedPaymentId): Promise<PlannedPayment | null> {
    try {
      const plannedPayment = await this.plannedPayments.find(id);
      if (plannedPayment.deletedAt) return null;
      if (plannedPayment.workplaceId !== workplaceId) return null;
      return plannedPayment;
    } catch {
      return null;
    }
  }

  async create(
    workplaceId: WorkplaceId,
    data: PlannedPaymentPersistenceInput,
  ): Promise<PlannedPayment> {
    const result = await this.db.write(async () => {
      return this.plannedPayments.create(pp => {
        Object.assign(pp, data);
        pp.createdAt = new Date();
        pp.updatedAt = new Date();
        pp.workplaceId = workplaceId;
      });
    });
    return result;
  }

  async update(
    workplaceId: WorkplaceId,
    pp: PlannedPayment,
    updates: Partial<PlannedPaymentPersistenceInput>,
  ): Promise<PlannedPayment> {
    //get first to verify workplace scoping
    const record = await this.find(workplaceId, pp.id);
    if (!record) {
      throw new Error('Planned payment not found');
    }
    return await this.db.write(async () => {
      await pp.update(record => {
        Object.assign(record, updates);
        record.updatedAt = new Date();
      });
      return pp;
    });
  }

  prepareUpdate(
    workplaceId: WorkplaceId,
    pp: PlannedPayment,
    updates: Partial<PlannedPaymentPersistenceInput>,
  ): Model {
    if (pp.workplaceId !== workplaceId) {
      throw new Error('Planned payment not found or does not belong to the workplace');
    }
    return pp.prepareUpdate(record => {
      Object.assign(record, updates);
      record.updatedAt = new Date();
    });
  }

  prepareStatusUpdate(
    workplaceId: WorkplaceId,
    pp: PlannedPayment,
    status: PlannedPaymentStatus,
    nextOccurrence?: number,
  ): Model {
    return this.prepareUpdate(workplaceId, pp, {
      status,
      ...(nextOccurrence === undefined ? {} : { nextOccurrence }),
    });
  }

  prepareDelete(workplaceId: WorkplaceId, pp: PlannedPayment): Model {
    if (pp.workplaceId !== workplaceId) {
      throw new Error('Planned payment not found or does not belong to the workplace');
    }

    return pp.prepareUpdate(record => {
      record.deletedAt = new Date();
      record.updatedAt = new Date();
    });
  }

  async findAllByFromAccountIds(
    workplaceId: WorkplaceId,
    accountIds: AccountId[],
  ): Promise<PlannedPayment[]> {
    if (accountIds.length === 0) return [];
    return this.plannedPayments
      .query(
        Q.where('workplace_id', workplaceId),
        Q.where('from_account_id', Q.oneOf(accountIds)),
        Q.where('deleted_at', Q.eq(null)),
      )
      .fetch();
  }

  async findAllByToAccountIds(
    workplaceId: WorkplaceId,
    accountIds: AccountId[],
  ): Promise<PlannedPayment[]> {
    if (accountIds.length === 0) return [];
    return this.plannedPayments
      .query(
        Q.where('workplace_id', workplaceId),
        Q.where('to_account_id', Q.oneOf(accountIds)),
        Q.where('deleted_at', Q.eq(null)),
      )
      .fetch();
  }

  /**
   * Prepares WatermelonDB operations to merge planned-payment references from source
   * accounts into a target account.
   */
  async prepareMergeOperations(
    workplaceId: WorkplaceId,
    sourceAccountIds: AccountId[],
    targetAccountId: AccountId,
  ): Promise<PlannedPayment[]> {
    const records = await this.loadMergeRecords(workplaceId, sourceAccountIds, targetAccountId);
    return this.prepareLoadedMergeOperations(records, sourceAccountIds, targetAccountId);
  }

  async loadMergeRecords(
    workplaceId: WorkplaceId,
    sourceAccountIds: AccountId[],
    targetAccountId: AccountId,
  ): Promise<PlannedPaymentMergeRecords> {
    const [sourceFrom, sourceTo, targetFrom, targetTo] = await Promise.all([
      this.findAllByFromAccountIds(workplaceId, sourceAccountIds),
      this.findAllByToAccountIds(workplaceId, sourceAccountIds),
      this.findAllByFromAccountIds(workplaceId, [targetAccountId]),
      this.findAllByToAccountIds(workplaceId, [targetAccountId]),
    ]);
    return { sourceFrom, sourceTo, targetFrom, targetTo };
  }

  prepareLoadedMergeOperations(
    records: PlannedPaymentMergeRecords,
    sourceAccountIds: AccountId[],
    targetAccountId: AccountId,
  ): PlannedPayment[] {
    const sourceIds = new Set(sourceAccountIds);

    const sourceRecords = new Map(
      [...records.sourceFrom, ...records.sourceTo].map(record => [record.id, record]),
    );
    const collisionCandidates = new Map(
      [...sourceRecords.values(), ...records.targetFrom, ...records.targetTo].map(record => [
        record.id,
        record,
      ]),
    );
    const collisionGroups = new Map<string, PlannedPayment[]>();

    for (const record of collisionCandidates.values()) {
      const key = JSON.stringify([
        record.name,
        record.description,
        record.amount,
        record.currencyCode,
        sourceIds.has(record.fromAccountId) ? targetAccountId : record.fromAccountId,
        sourceIds.has(record.toAccountId) ? targetAccountId : record.toAccountId,
        record.intervalN,
        record.intervalType,
        record.startDate,
        record.endDate,
        record.nextOccurrence,
        record.isAutoPost,
        record.recurrenceDay,
        record.recurrenceMonth,
      ]);
      const group = collisionGroups.get(key) ?? [];
      group.push(record);
      collisionGroups.set(key, group);
    }

    const pausedSourceIds = new Set<string>();
    for (const group of collisionGroups.values()) {
      if (group.length < 2) continue;
      const winner = group.find(record => !sourceRecords.has(record.id)) ?? group[0];
      for (const record of group) {
        if (record.id !== winner.id && sourceRecords.has(record.id)) {
          pausedSourceIds.add(record.id);
        }
      }
    }

    return [...sourceRecords.values()].map(record =>
      record.prepareUpdate(updated => {
        if (sourceIds.has(updated.fromAccountId)) updated.fromAccountId = targetAccountId;
        if (sourceIds.has(updated.toAccountId)) updated.toAccountId = targetAccountId;
        if (pausedSourceIds.has(record.id)) updated.status = PlannedPaymentStatus.PAUSED;
        updated.updatedAt = new Date();
      }),
    );
  }
}

export const plannedPaymentRepository = new PlannedPaymentRepository();
