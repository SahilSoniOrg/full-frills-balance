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
}

export const plannedPaymentRepository = new PlannedPaymentRepository();
