import type Account from '@/src/data/models/Account';
import BaseScopedModel from '@/src/data/models/BaseScopedModel';
import type Journal from '@/src/data/models/Journal';
import { AccountId, JournalId, TransactionId } from '@/src/types/ids';
import { TransactionType } from '@/src/types/enums';
import { Relation } from '@nozbe/watermelondb';
import { date, field, relation } from '@nozbe/watermelondb/decorators';

export default class Transaction extends BaseScopedModel<TransactionId> {
  static table = 'transactions';
  static associations = {
    journals: { type: 'belongs_to', key: 'journal_id' },
    accounts: { type: 'belongs_to', key: 'account_id' },
  } as const;

  @field('journal_id') journalId!: JournalId;
  @field('account_id') accountId!: AccountId;
  @field('amount') amount!: number;
  @field('transaction_type') transactionType!: TransactionType;
  @field('currency_code') currencyCode!: string;
  @field('transaction_date') transactionDate!: number;
  @field('notes') notes?: string;
  @field('exchange_rate') exchangeRate?: number; // For multi-currency transactions
  @field('running_balance') runningBalance?: number | null; // Rebuildable cache only

  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
  @date('deleted_at') deletedAt?: Date;

  // Relations with proper types
  @relation('journals', 'journal_id') journal!: Relation<Journal>;
  @relation('accounts', 'account_id') account!: Relation<Account>;
}
