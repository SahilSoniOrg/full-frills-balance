import type Account from '@/src/data/models/Account';
import BaseScopedModel from '@/src/data/models/BaseScopedModel';
import type Budget from '@/src/data/models/Budget';
import { AccountId, BudgetId } from '@/src/types/domain';
import { Relation } from '@nozbe/watermelondb';
import { date, field, relation } from '@nozbe/watermelondb/decorators';

export default class BudgetScope extends BaseScopedModel {
  static table = 'budget_scopes';
  static associations = {
    budgets: { type: 'belongs_to', key: 'budget_id' },
    accounts: { type: 'belongs_to', key: 'account_id' },
  } as const;

  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;

  @relation('budgets', 'budget_id') budget!: Relation<Budget>;
  @relation('accounts', 'account_id') account!: Relation<Account>;

  @field('budget_id') budgetId!: BudgetId;
  @field('account_id') accountId!: AccountId;
}
