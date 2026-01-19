import { Model, Relation } from '@nozbe/watermelondb'
import { date, field, relation } from '@nozbe/watermelondb/decorators'
import Account from './Account'
import Journal from './Journal'

export enum TransactionType {
  DEBIT = 'DEBIT',
  CREDIT = 'CREDIT',
}

export default class Transaction extends Model {
  static table = 'transactions'
  static associations = {
    journals: { type: 'belongs_to', key: 'journal_id' },
    accounts: { type: 'belongs_to', key: 'account_id' },
  } as const

  @field('journal_id') journalId!: string
  @field('account_id') accountId!: string
  @field('amount') amount!: number
  @field('transaction_type') transactionType!: TransactionType
  @field('currency_code') currencyCode!: string
  @field('transaction_date') transactionDate!: number
  @field('notes') notes?: string
  @field('exchange_rate') exchangeRate?: number // For multi-currency transactions
  @field('running_balance') runningBalance?: number // Rebuildable cache only

  @date('created_at') createdAt!: Date
  @date('updated_at') updatedAt!: Date
  @date('deleted_at') deletedAt?: Date

  // Relations with proper types
  @relation('journals', 'journal_id') journal!: Relation<Journal>
  @relation('accounts', 'account_id') account!: Relation<Account>
}
