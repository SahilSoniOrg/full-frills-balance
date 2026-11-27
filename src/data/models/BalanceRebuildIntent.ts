import BaseScopedModel from '@/src/data/models/BaseScopedModel';
import { AccountId } from '@/src/types/ids';
import { field, readonly, date } from '@nozbe/watermelondb/decorators';

/** Durable request to rebuild one account projection from the earliest changed date. */
export default class BalanceRebuildIntent extends BaseScopedModel {
  static table = 'balance_rebuild_intents';

  @field('account_id') accountId!: AccountId;
  @field('from_date') fromDate!: number;
  @field('people_settlement_journal_date') peopleSettlementJournalDate?: number;
  @field('revision') revision!: string;
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}
