import Account from '@/src/data/models/Account'
import { Model, Relation } from '@nozbe/watermelondb'
import { date, field, relation } from '@nozbe/watermelondb/decorators'

export default class AccountMetadata extends Model {
  static table = 'account_metadata'
  static associations = {
    accounts: { type: 'belongs_to', key: 'account_id' },
  } as const

  @relation('accounts', 'account_id') account!: Relation<Account>

  @field('statement_day') statementDay?: number
  @field('due_day') dueDay?: number
  @field('minimum_payment_amount') minimumPaymentAmount?: number
  @field('minimum_balance_amount') minimumBalanceAmount?: number
  @field('credit_limit_amount') creditLimitAmount?: number
  @field('apr_bps') aprBps?: number
  @field('emi_day') emiDay?: number
  @field('loan_tenure_months') loanTenureMonths?: number
  @field('autopay_enabled') autopayEnabled?: boolean
  @field('grace_period_days') gracePeriodDays?: number
  @field('notes') notes?: string

  @date('created_at') createdAt!: Date
  @date('updated_at') updatedAt!: Date
}
