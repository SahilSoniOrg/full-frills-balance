import BaseScopedModel from '@/src/data/models/BaseScopedModel';
import { date, field } from '@nozbe/watermelondb/decorators';

import { AccountId, PlannedPaymentId } from '@/src/types/ids';
import { PlainPlannedPayment } from '@/src/types/plainDtos';
import { PlannedPaymentInterval, PlannedPaymentStatus } from '@/src/types/enums';
import type { PlannedPaymentFxMode } from '@/src/types/plainDtos';

export default class PlannedPayment extends BaseScopedModel<PlannedPaymentId> {
  static table = 'planned_payments';

  @field('name') name!: string;
  @field('description') description?: string;
  @field('amount') amount!: number;
  @field('currency_code') currencyCode!: string;
  @field('fx_mode') fxMode?: PlannedPaymentFxMode;
  @field('destination_amount') destinationAmount?: number;
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
}

export function toPlainPlannedPayment(pp: PlannedPayment): PlainPlannedPayment {
  return {
    id: pp.id,
    name: pp.name,
    description: pp.description,
    amount: pp.amount,
    currencyCode: pp.currencyCode,
    fxMode: pp.fxMode ?? undefined,
    destinationAmount: pp.destinationAmount ?? undefined,
    fromAccountId: pp.fromAccountId,
    toAccountId: pp.toAccountId,
    intervalN: pp.intervalN,
    intervalType: pp.intervalType,
    startDate: pp.startDate,
    endDate: pp.endDate ?? undefined,
    nextOccurrence: pp.nextOccurrence,
    status: pp.status,
    isAutoPost: pp.isAutoPost,
    recurrenceDay: pp.recurrenceDay ?? undefined,
    recurrenceMonth: pp.recurrenceMonth ?? undefined,
  };
}
