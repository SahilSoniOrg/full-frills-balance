import { Model } from '@nozbe/watermelondb'
import { date, field, relation } from '@nozbe/watermelondb/decorators'

export enum JournalStatus {
  DRAFT = 'DRAFT',
  POSTED = 'POSTED',
  REVERSED = 'REVERSED',
}

export default class Journal extends Model {
  static table = 'journals'
  static associations = {
    transactions: { type: 'has_many', foreignKey: 'journal_id' },
  } as const

  @field('journal_date') journalDate!: number
  @field('description') description?: string
  @field('currency_code') currencyCode!: string
  @field('status') status!: JournalStatus
  @field('original_journal_id') originalJournalId?: string
  @field('reversing_journal_id') reversingJournalId?: string

  // Denormalized fields for list performance
  // totalAmount is the magnitude of the journal (sum of all debits)
  @field('total_amount') totalAmount!: number
  @field('transaction_count') transactionCount!: number
  @field('display_type') displayType!: string // INCOME, EXPENSE, TRANSFER, MIXED

  @date('created_at') createdAt!: Date
  @date('updated_at') updatedAt!: Date
  @date('deleted_at') deletedAt?: Date

  // Relations
  @relation('transactions', 'journal_id') transactions!: any
  @relation('journals', 'original_journal_id') originalJournal!: any
  @relation('journals', 'reversing_journal_id') reversingJournal!: any
}
