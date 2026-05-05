import { database } from '@/src/data/database/Database';
import PlannedPayment, {
  PlannedPaymentInterval,
  PlannedPaymentStatus,
} from '@/src/data/models/PlannedPayment';
import { analytics } from '@/src/services/analytics-service';
import { Q } from '@nozbe/watermelondb';
import { map } from 'rxjs/operators';

export interface PlannedPaymentPersistenceInput {
  name: string;
  description?: string;
  amount: number;
  currencyCode: string;
  fromAccountId: string;
  toAccountId: string;
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

  observeAll(workplaceId: string) {
    return this.plannedPayments
      .query(
        Q.where('workplace_id', workplaceId),
        Q.where('deleted_at', Q.eq(null)),
        Q.sortBy('next_occurrence', Q.asc),
      )
      .observe();
  }

  observeById(workplaceId: string, id: string) {
    return this.plannedPayments
      .query(Q.where('workplace_id', workplaceId), Q.where('id', id))
      .observe()
      .pipe(map(results => results[0] ?? null));
  }

  observeActive(workplaceId: string) {
    return this.plannedPayments
      .query(
        Q.where('workplace_id', workplaceId),
        Q.where('status', PlannedPaymentStatus.ACTIVE),
        Q.where('deleted_at', Q.eq(null)),
        Q.sortBy('next_occurrence', Q.asc),
      )
      .observe();
  }

  async findAllActive(workplaceId: string): Promise<PlannedPayment[]> {
    return this.plannedPayments
      .query(
        Q.where('workplace_id', workplaceId),
        Q.where('status', PlannedPaymentStatus.ACTIVE),
        Q.where('deleted_at', Q.eq(null)),
      )
      .fetch();
  }

  async find(workplaceId: string, id: string): Promise<PlannedPayment | null> {
    try {
      const list = await this.plannedPayments
        .query(Q.where('workplace_id', workplaceId), Q.where('id', id))
        .fetch();
      return list[0] ?? null;
    } catch {
      return null;
    }
  }

  async create(workplaceId: string, data: PlannedPaymentPersistenceInput): Promise<PlannedPayment> {
    const result = await this.db.write(async () => {
      return this.plannedPayments.create(pp => {
        Object.assign(pp, data);
        pp.createdAt = new Date();
        pp.updatedAt = new Date();
        pp.workplaceId = workplaceId;
      });
    });
    analytics.logPlannedPaymentCreated(data.intervalType, data.isAutoPost ? 'auto' : 'manual');
    return result;
  }

  async update(
    workplaceId: string,
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

  async delete(workplaceId: string, pp: PlannedPayment): Promise<void> {
    const record = await this.find(workplaceId, pp.id);
    if (!record) {
      throw new Error('Planned payment not found');
    }
    await this.db.write(async () => {
      await record.update(r => {
        r.deletedAt = new Date();
        r.updatedAt = new Date();
      });
    });
  }
}

export const plannedPaymentRepository = new PlannedPaymentRepository();
