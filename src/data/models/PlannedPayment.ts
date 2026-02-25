import Journal from '@/src/data/models/Journal'
import { Model, Query } from '@nozbe/watermelondb'
import { children, date, field } from '@nozbe/watermelondb/decorators'

export enum PlannedPaymentInterval {
    DAILY = 'DAILY',
    WEEKLY = 'WEEKLY',
    MONTHLY = 'MONTHLY',
    YEARLY = 'YEARLY',
}

export enum PlannedPaymentStatus {
    ACTIVE = 'ACTIVE',
    PAUSED = 'PAUSED',
    COMPLETED = 'COMPLETED',
}

export default class PlannedPayment extends Model {
    static table = 'planned_payments'
    static associations = {
        journals: { type: 'has_many', foreignKey: 'planned_payment_id' },
    } as const

    @field('name') name!: string
    @field('description') description?: string
    @field('amount') amount!: number
    @field('currency_code') currencyCode!: string
    @field('from_account_id') fromAccountId!: string
    @field('to_account_id') toAccountId!: string
    @field('interval_n') intervalN!: number
    @field('interval_type') intervalType!: PlannedPaymentInterval
    @field('start_date') startDate!: number
    @field('end_date') endDate?: number
    @field('next_occurrence') nextOccurrence!: number
    @field('status') status!: PlannedPaymentStatus
    @field('is_auto_post') isAutoPost!: boolean
    @field('recurrence_day') recurrenceDay?: number
    @field('recurrence_month') recurrenceMonth?: number

    @date('created_at') createdAt!: Date
    @date('updated_at') updatedAt!: Date
    @date('deleted_at') deletedAt?: Date

    @children('journals') journals!: Query<Journal>
}
