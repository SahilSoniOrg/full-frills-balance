import { Model, Query } from '@nozbe/watermelondb'
import { children, date, field } from '@nozbe/watermelondb/decorators'
import Transaction from './Transaction'

export enum AccountType {
  ASSET = 'ASSET',
  LIABILITY = 'LIABILITY',
  EQUITY = 'EQUITY',
  INCOME = 'INCOME',
  EXPENSE = 'EXPENSE',
}

export default class Account extends Model {
  static table = 'accounts'
  static associations = {
    transactions: { type: 'has_many', foreignKey: 'account_id' },
    accounts: { type: 'has_many', foreignKey: 'parent_account_id' },
  } as const

  @field('name') name!: string
  @field('account_type') accountType!: AccountType
  @field('currency_code') currencyCode!: string
  @field('parent_account_id') parentAccountId?: string
  @field('description') description?: string

  @date('created_at') createdAt!: Date
  @date('updated_at') updatedAt!: Date
  @date('deleted_at') deletedAt?: Date

  // Relations with proper types
  @children('transactions') transactions!: Query<Transaction>
  @children('accounts') subAccounts!: Query<Account>
}
