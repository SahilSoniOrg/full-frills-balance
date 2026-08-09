import BaseScopedModel from '@/src/data/models/BaseScopedModel';
import { AccountId } from '@/src/types/domain';
import { date, field, readonly, relation } from '@nozbe/watermelondb/decorators';
import { Relation } from '@nozbe/watermelondb';
import Account from './Account';

export default class TransactionAutoPostRule extends BaseScopedModel {
  static table = 'transaction_auto_post_rules';
  static associations = {
    accounts: { type: 'belongs_to', key: 'source_account_id' },
  } as const; // Note: accounts relation is standard scoped

  @field('channels_json') channelsJson?: string; // Serialized string array e.g. '["sms"]'
  @field('sender_match') senderMatch?: string;
  @field('body_match') bodyMatch?: string;
  @field('conditions_json') conditionsJson?: string;
  @field('actions_json') actionsJson?: string;
  @field('priority') priority?: number;
  @field('source_account_id') sourceAccountId!: AccountId;
  @field('category_account_id') categoryAccountId!: AccountId;
  @field('is_active') isActive!: boolean;

  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;

  @relation('accounts', 'source_account_id') sourceAccount!: Relation<Account>;
  @relation('accounts', 'category_account_id') categoryAccount!: Relation<Account>;
}
