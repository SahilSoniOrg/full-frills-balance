import BaseScopedModel from '@/src/data/models/BaseScopedModel';
import Journal from '@/src/data/models/Journal';
import { Query } from '@nozbe/watermelondb';
import { children, date, field } from '@nozbe/watermelondb/decorators';

import {
  AccountId,
  PlainPlannedPayment,
  PlannedPaymentId,
  PlannedPaymentInterval,
  PlannedPaymentStatus,
} from '@/src/types/domain';

export { PlannedPaymentInterval, PlannedPaymentStatus };

export default class PlannedPayment extends BaseScopedModel<PlannedPaymentId> {
  static table = 'planned_payments';
  static associations = {
    journals: { type: 'has_many', foreignKey: 'planned_payment_id' },
  } as const;

  @field('name') name!: string;
  @field('description') description?: string;
  @field('amount') amount!: number;
  @field('currency_code') currencyCode!: string;
  @field('from_account_id') fromAccountId!: AccountId;
  @field('to_account_id') toAccountId!: AccountId;
  @field('interval_n') intervalN!: number;
  @field('interval_type') intervalType!: PlannedPaymentInterval;
  @field('start_date') startDate!: number;
  @field('end_date') endDate?: number;
  @field('next_occurrence') nextOccurrence!: number;
  @field('status') status!: PlannedPaymentStatus;
  @field('is_auto_post') isAutoPost!: boolean;
  @field('recurrence_day') recurrenceDay?: number;
  @field('recurrence_month') recurrenceMonth?: number;

  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
  @date('deleted_at') deletedAt?: Date;

  @children('journals') journals!: Query<Journal>;
}

export function toPlainPlannedPayment(pp: PlannedPayment): PlainPlannedPayment {
  return {
    id: pp.id,
    name: pp.name,
    description: pp.description,
    amount: pp.amount,
    currencyCode: pp.currencyCode,
    fromAccountId: pp.fromAccountId,
    toAccountId: pp.toAccountId,
    intervalN: pp.intervalN,
    intervalType: pp.intervalType,
    startDate: pp.startDate,
    endDate: pp.endDate,
    nextOccurrence: pp.nextOccurrence,
    status: pp.status,
    isAutoPost: pp.isAutoPost,
    recurrenceDay: pp.recurrenceDay,
    recurrenceMonth: pp.recurrenceMonth,
  };
}
