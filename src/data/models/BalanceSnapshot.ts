import BaseScopedModel from '@/src/data/models/BaseScopedModel';
import { AccountId, TransactionId } from '@/src/types/domain';
import { date, field, readonly } from '@nozbe/watermelondb/decorators';

export default class BalanceSnapshot extends BaseScopedModel {
  static table = 'balance_snapshots';

  static associations = {
    accounts: { type: 'belongs_to', key: 'account_id' },
    transactions: { type: 'belongs_to', key: 'transaction_id' },
  } as const;

  @field('account_id') accountId!: AccountId;
  @field('transaction_id') transactionId!: TransactionId;
  @field('transaction_date') transactionDate!: number;
  @field('absolute_balance') absoluteBalance!: number;
  @field('transaction_count') transactionCount!: number;

  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}
