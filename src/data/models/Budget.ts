import BaseScopedModel from '@/src/data/models/BaseScopedModel';
import BudgetScope from '@/src/data/models/BudgetScope';
import { BudgetId } from '@/src/types/domain';
import { Query } from '@nozbe/watermelondb';
import { children, date, field } from '@nozbe/watermelondb/decorators';

export default class Budget extends BaseScopedModel<BudgetId> {
  static table = 'budgets';
  static associations = {
    budget_scopes: { type: 'has_many', foreignKey: 'budget_id' },
  } as const;

  @field('name') name!: string;
  @field('amount') amount!: number;
  @field('currency_code') currencyCode!: string;
  @field('start_month') startMonth!: string;
  @field('interval_type') intervalType!: string;
  @field('interval_n') intervalN!: number;
  @field('start_date') startDate?: number;
  @field('recurrence_day') recurrenceDay?: number;
  @field('recurrence_month') recurrenceMonth?: number;
  @field('active') active!: boolean;
  @field('asset_account_ids') assetAccountIds?: string;

  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;

  // Relations with proper types
  @children('budget_scopes') scopes!: Query<BudgetScope>;
}
