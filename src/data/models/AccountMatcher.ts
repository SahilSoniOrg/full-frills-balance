import BaseScopedModel from '@/src/data/models/BaseScopedModel';
import { AccountId } from '@/src/types/ids';
import { date, field, readonly } from '@nozbe/watermelondb/decorators';

export default class AccountMatcher extends BaseScopedModel {
  static table = 'account_matchers';
  @field('account_id') accountId!: AccountId;
  @field('definition_json') definitionJson!: string;
  @field('conditions_key') conditionsKey!: string;
  @field('is_enabled') isEnabled!: boolean;
  @field('provenance') provenance!: string;
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}
