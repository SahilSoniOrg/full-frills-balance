import { database } from '@/src/data/database/Database';
import Account from '@/src/data/models/Account';
import PlannedPayment from '@/src/data/models/PlannedPayment';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import {
  stageModelWrite,
  type AccountingWriteSession,
} from '@/src/data/repositories/AccountingWriteSession';
import { observeQueryWithModelChanges } from '@/src/data/repositories/observeQueryWithModelChanges';
import { AuditAction, PlannedPaymentInterval, PlannedPaymentStatus } from '@/src/types/enums';
import type { AuditEventType } from '@/src/types/auditEvents';
import type { PlannedPaymentFxFields, PlannedPaymentFxMode } from '@/src/types/plannedPaymentFx';
import { AccountId, PlannedPaymentId, WorkplaceId } from '@/src/types/ids';
import { Q } from '@nozbe/watermelondb';
import type { Model } from '@nozbe/watermelondb';
import { map } from 'rxjs/operators';

export interface PlannedPaymentPersistenceInput extends PlannedPaymentFxFields {
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

export type PlannedPaymentScheduleUpdate = Partial<
  Omit<PlannedPaymentPersistenceInput, 'status' | 'nextOccurrence'>
> & { nextOccurrence?: number };

export type PlannedPaymentOccurrenceUpdate = Partial<
  Pick<PlannedPaymentPersistenceInput, 'status' | 'nextOccurrence'>
>;

export type PlannedPaymentMergeRecords = {
  sourceFrom: PlannedPayment[];
  sourceTo: PlannedPayment[];
  targetFrom: PlannedPayment[];
  targetTo: PlannedPayment[];
};

function auditPlannedPaymentState(
  payment: PlannedPayment,
  overrides: Partial<PlannedPaymentPersistenceInput> = {},
): Record<string, unknown> {
  return {
    name: overrides.name ?? payment.name,
    description: Object.prototype.hasOwnProperty.call(overrides, 'description')
      ? (overrides.description ?? null)
      : (payment.description ?? null),
    amount: overrides.amount ?? payment.amount,
    currencyCode: overrides.currencyCode ?? payment.currencyCode,
    fxMode: Object.prototype.hasOwnProperty.call(overrides, 'fxMode')
      ? (overrides.fxMode ?? null)
      : (payment.fxMode ?? null),
    destinationAmount: Object.prototype.hasOwnProperty.call(overrides, 'destinationAmount')
      ? (overrides.destinationAmount ?? null)
      : (payment.destinationAmount ?? null),
    fromAccountId: overrides.fromAccountId ?? payment.fromAccountId,
    toAccountId: overrides.toAccountId ?? payment.toAccountId,
    intervalN: overrides.intervalN ?? payment.intervalN,
    intervalType: overrides.intervalType ?? payment.intervalType,
    startDate: overrides.startDate ?? payment.startDate,
    endDate: Object.prototype.hasOwnProperty.call(overrides, 'endDate')
      ? (overrides.endDate ?? null)
      : (payment.endDate ?? null),
    nextOccurrence: overrides.nextOccurrence ?? payment.nextOccurrence,
    status: overrides.status ?? payment.status,
    isAutoPost: overrides.isAutoPost ?? payment.isAutoPost,
    recurrenceDay: Object.prototype.hasOwnProperty.call(overrides, 'recurrenceDay')
      ? (overrides.recurrenceDay ?? null)
      : (payment.recurrenceDay ?? null),
    recurrenceMonth: Object.prototype.hasOwnProperty.call(overrides, 'recurrenceMonth')
      ? (overrides.recurrenceMonth ?? null)
      : (payment.recurrenceMonth ?? null),
  };
}

function stableAuditJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableAuditJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map(key => `${JSON.stringify(key)}:${stableAuditJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

export class PlannedPaymentRepository {
  private get db() {
    return database;
  }

  private get plannedPayments() {
    return this.db.collections.get<PlannedPayment>('planned_payments');
  }

  observeAll(workplaceId: WorkplaceId) {
    return observeQueryWithModelChanges(
      this.plannedPayments.query(
        Q.where('workplace_id', workplaceId),
        Q.where('deleted_at', Q.eq(null)),
        Q.sortBy('next_occurrence', Q.asc),
      ),
    );
  }

  observeById(workplaceId: WorkplaceId, id: PlannedPaymentId) {
    return observeQueryWithModelChanges(
      this.plannedPayments.query(Q.where('workplace_id', workplaceId), Q.where('id', id)),
    ).pipe(map(results => results[0] ?? null));
  }

  observeByIdsIncludingDeleted(workplaceId: WorkplaceId, ids: PlannedPaymentId[]) {
    return this.plannedPayments
      .query(Q.where('workplace_id', workplaceId), Q.where('id', Q.oneOf(ids)))
      .observe();
  }

  observeActive(workplaceId: WorkplaceId) {
    return observeQueryWithModelChanges(
      this.plannedPayments.query(
        Q.where('workplace_id', workplaceId),
        Q.where('status', PlannedPaymentStatus.ACTIVE),
        Q.where('deleted_at', Q.eq(null)),
        Q.sortBy('next_occurrence', Q.asc),
      ),
    );
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

  async findAllForDueSettlement(workplaceId: WorkplaceId): Promise<PlannedPayment[]> {
    return this.plannedPayments
      .query(
        Q.where('workplace_id', workplaceId),
        Q.where('status', Q.oneOf([PlannedPaymentStatus.ACTIVE, PlannedPaymentStatus.COMPLETED])),
        Q.where('deleted_at', Q.eq(null)),
      )
      .fetch();
  }

  async find(workplaceId: WorkplaceId, id: PlannedPaymentId): Promise<PlannedPayment | null> {
    const matches = await this.plannedPayments
      .query(
        Q.where('id', id),
        Q.where('workplace_id', workplaceId),
        Q.where('deleted_at', Q.eq(null)),
      )
      .fetch();
    return matches[0] ?? null;
  }

  async create(
    workplaceId: WorkplaceId,
    data: PlannedPaymentPersistenceInput,
    validateReferences?: () => Promise<unknown>,
  ): Promise<PlannedPayment> {
    const result = await this.db.write(async () => {
      await validateReferences?.();
      const created = this.plannedPayments.prepareCreate(pp => {
        Object.assign(pp, data);
        pp.createdAt = new Date();
        pp.updatedAt = new Date();
        pp.workplaceId = workplaceId;
      });
      await this.db.batch(
        created,
        auditRepository.prepareLog(
          {
            entityType: 'planned_payment',
            entityId: created.id,
            eventType: 'planned_payment.created',
            action: AuditAction.CREATE,
            changes: { after: auditPlannedPaymentState(created) },
            undoable: false,
          },
          workplaceId,
        ),
      );
      return created;
    });
    return result;
  }

  async updateSchedule(
    workplaceId: WorkplaceId,
    pp: PlannedPayment,
    updates: PlannedPaymentScheduleUpdate,
    validateReferences?: () => Promise<unknown>,
  ): Promise<PlannedPayment> {
    return await this.db.write(async () => {
      await validateReferences?.();
      const record = await this.find(workplaceId, pp.id);
      if (!record) throw new Error('Planned payment not found');
      const before = auditPlannedPaymentState(record);
      const after = auditPlannedPaymentState(record, updates);
      const update = record.prepareUpdate(current => {
        Object.assign(current, updates);
        current.updatedAt = new Date();
      });
      await this.db.batch(
        update,
        auditRepository.prepareLog(
          {
            entityType: 'planned_payment',
            entityId: pp.id,
            eventType: 'planned_payment.updated',
            action: AuditAction.UPDATE,
            changes: { before, after },
            undoable: true,
          },
          workplaceId,
        ),
      );
      return record;
    });
  }

  async revertAuditUpdate(
    workplaceId: WorkplaceId,
    id: PlannedPaymentId,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
    changedFields: readonly string[],
    auditLogId: string,
  ): Promise<void> {
    const revertibleFields = new Set([
      'name',
      'description',
      'amount',
      'currencyCode',
      'fxMode',
      'destinationAmount',
      'fromAccountId',
      'toAccountId',
      'intervalN',
      'intervalType',
      'startDate',
      'endDate',
      'nextOccurrence',
      'isAutoPost',
      'recurrenceDay',
      'recurrenceMonth',
    ]);
    const conflictMessage =
      'This planned payment changed after the selected history entry. Refresh and review the latest change.';

    await this.db.write(async () => {
      let record: PlannedPayment;
      try {
        record = await this.plannedPayments.find(id);
      } catch {
        throw new Error(conflictMessage);
      }
      if (record.workplaceId !== workplaceId || record.deletedAt || changedFields.length === 0) {
        throw new Error(conflictMessage);
      }

      const current = auditPlannedPaymentState(record);
      const restored: Record<string, unknown> = { ...current };
      for (const field of changedFields) {
        if (
          !revertibleFields.has(field) ||
          !Object.prototype.hasOwnProperty.call(before, field) ||
          !Object.prototype.hasOwnProperty.call(after, field) ||
          stableAuditJson(current[field]) !== stableAuditJson(after[field])
        ) {
          throw new Error(conflictMessage);
        }
        restored[field] = before[field];
      }

      const accountIds = [...new Set([restored.fromAccountId, restored.toAccountId])];
      if (accountIds.some(accountId => typeof accountId !== 'string')) {
        throw new Error(conflictMessage);
      }
      const accounts = await this.db.collections
        .get<Account>('accounts')
        .query(
          Q.where('workplace_id', workplaceId),
          Q.where('id', Q.oneOf(accountIds as string[])),
          Q.where('deleted_at', Q.eq(null)),
        )
        .fetch();
      if (accounts.length !== accountIds.length) throw new Error(conflictMessage);

      const updates: Partial<PlannedPaymentPersistenceInput> = {};
      for (const field of changedFields) {
        const value = restored[field];
        switch (field) {
          case 'name':
            updates.name = value as string;
            break;
          case 'description':
            updates.description = value == null ? undefined : (value as string);
            break;
          case 'amount':
            updates.amount = value as number;
            break;
          case 'currencyCode':
            updates.currencyCode = value as string;
            break;
          case 'fxMode':
            updates.fxMode = value == null ? undefined : (value as PlannedPaymentFxMode);
            break;
          case 'destinationAmount':
            updates.destinationAmount = value == null ? undefined : (value as number);
            break;
          case 'fromAccountId':
            updates.fromAccountId = value as AccountId;
            break;
          case 'toAccountId':
            updates.toAccountId = value as AccountId;
            break;
          case 'intervalN':
            updates.intervalN = value as number;
            break;
          case 'intervalType':
            updates.intervalType = value as PlannedPaymentInterval;
            break;
          case 'startDate':
            updates.startDate = value as number;
            break;
          case 'endDate':
            updates.endDate = value == null ? undefined : (value as number);
            break;
          case 'nextOccurrence':
            updates.nextOccurrence = value as number;
            break;
          case 'isAutoPost':
            updates.isAutoPost = value as boolean;
            break;
          case 'recurrenceDay':
            updates.recurrenceDay = value == null ? undefined : (value as number);
            break;
          case 'recurrenceMonth':
            updates.recurrenceMonth = value == null ? undefined : (value as number);
            break;
        }
      }

      const restoredState = auditPlannedPaymentState(record, updates);
      const now = new Date();
      await this.db.batch(
        record.prepareUpdate(currentRecord => {
          Object.assign(currentRecord, updates);
          currentRecord.updatedAt = now;
        }),
        auditRepository.prepareLog(
          {
            entityType: 'planned_payment',
            entityId: id,
            eventType: 'planned_payment.reverted',
            action: AuditAction.UPDATE,
            source: 'app',
            revertsLogId: auditLogId,
            undoable: false,
            changes: { before: current, after: restoredState },
          },
          workplaceId,
        ),
      );
    });
  }

  async updateInSession(
    session: AccountingWriteSession,
    workplaceId: WorkplaceId,
    id: PlannedPaymentId,
    updates: PlannedPaymentScheduleUpdate | PlannedPaymentOccurrenceUpdate,
    expected?: Partial<Pick<PlannedPayment, 'status' | 'nextOccurrence'>>,
    auditOptions: {
      eventType?: AuditEventType;
      source?: 'app' | 'system' | (string & {});
      correlationId?: string;
      undoable?: boolean;
    } = {},
  ): Promise<PlannedPayment> {
    const record = await this.find(workplaceId, id);
    if (!record) throw new Error('This planned payment was deleted.');
    if (
      expected &&
      ((expected.status !== undefined && record.status !== expected.status) ||
        (expected.nextOccurrence !== undefined &&
          record.nextOccurrence !== expected.nextOccurrence))
    ) {
      throw new Error('Planned payment changed while its occurrence was being processed');
    }

    stageModelWrite(session, () => {
      const before = auditPlannedPaymentState(record);
      const after = auditPlannedPaymentState(record, updates);
      return [
        this.prepareUpdate(workplaceId, record, updates),
        auditRepository.prepareLog(
          {
            entityType: 'planned_payment',
            entityId: record.id,
            eventType: auditOptions.eventType ?? 'planned_payment.updated',
            source: auditOptions.source ?? 'system',
            correlationId: auditOptions.correlationId,
            action: AuditAction.UPDATE,
            changes: { before, after },
            undoable: auditOptions.undoable ?? false,
          },
          workplaceId,
        ),
      ];
    });
    return record;
  }

  async deleteInSession(
    session: AccountingWriteSession,
    workplaceId: WorkplaceId,
    id: PlannedPaymentId,
  ): Promise<PlannedPayment> {
    const record = await this.find(workplaceId, id);
    if (!record) throw new Error('Planned payment not found');
    stageModelWrite(session, () => [
      this.prepareDelete(workplaceId, record),
      auditRepository.prepareLog(
        {
          entityType: 'planned_payment',
          entityId: record.id,
          eventType: 'planned_payment.deleted',
          source: 'app',
          action: AuditAction.DELETE,
          changes: { before: auditPlannedPaymentState(record), after: { deletedAt: new Date() } },
          undoable: false,
        },
        workplaceId,
      ),
    ]);
    return record;
  }

  private prepareUpdate(
    workplaceId: WorkplaceId,
    pp: PlannedPayment,
    updates: Partial<PlannedPaymentPersistenceInput>,
  ): PlannedPayment {
    if (pp.workplaceId !== workplaceId) {
      throw new Error('Planned payment not found or does not belong to the workplace');
    }
    return pp.prepareUpdate(record => {
      Object.assign(record, updates);
      record.updatedAt = new Date();
    });
  }

  private prepareDelete(workplaceId: WorkplaceId, pp: PlannedPayment): PlannedPayment {
    if (pp.workplaceId !== workplaceId) {
      throw new Error('Planned payment not found or does not belong to the workplace');
    }

    const now = new Date();
    return pp.prepareUpdate(record => {
      record.deletedAt = now;
      record.updatedAt = now;
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
  async mergeAccountsInSession(
    session: AccountingWriteSession,
    workplaceId: WorkplaceId,
    sourceAccountIds: AccountId[],
    targetAccountId: AccountId,
    correlationId?: string,
  ): Promise<void> {
    const records = await this.loadMergeRecords(workplaceId, sourceAccountIds, targetAccountId);
    stageModelWrite(session, () =>
      this.prepareLoadedMergeOperations(records, sourceAccountIds, targetAccountId, correlationId),
    );
  }

  private async loadMergeRecords(
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

  private prepareLoadedMergeOperations(
    records: PlannedPaymentMergeRecords,
    sourceAccountIds: AccountId[],
    targetAccountId: AccountId,
    correlationId?: string,
  ): Model[] {
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
        record.fxMode ?? null,
        record.destinationAmount ?? null,
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

    return [...sourceRecords.values()].flatMap(record => {
      const updates: Partial<PlannedPaymentPersistenceInput> = {
        fromAccountId: sourceIds.has(record.fromAccountId) ? targetAccountId : record.fromAccountId,
        toAccountId: sourceIds.has(record.toAccountId) ? targetAccountId : record.toAccountId,
        ...(pausedSourceIds.has(record.id) ? { status: PlannedPaymentStatus.PAUSED } : {}),
      };
      const before = auditPlannedPaymentState(record);
      const after = auditPlannedPaymentState(record, updates);
      return [
        this.prepareUpdate(record.workplaceId, record, updates),
        auditRepository.prepareLog(
          {
            entityType: 'planned_payment',
            entityId: record.id,
            eventType: 'planned_payment.accounts_retargeted',
            source: 'app',
            correlationId,
            action: AuditAction.UPDATE,
            changes: { before, after },
            undoable: false,
          },
          record.workplaceId,
        ),
      ];
    });
  }
}

export const plannedPaymentRepository = new PlannedPaymentRepository();
