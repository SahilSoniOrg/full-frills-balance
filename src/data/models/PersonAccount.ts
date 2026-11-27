import BaseScopedModel from '@/src/data/models/BaseScopedModel';
import type { PersonAccountId, PersonId, AccountId } from '@/src/types/ids';
import { date, field } from '@nozbe/watermelondb/decorators';
export default class PersonAccount extends BaseScopedModel<PersonAccountId> {
  static table = 'person_accounts';
  @field('person_id') personId!: PersonId;
  @field('account_id') accountId!: AccountId;
  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
  @date('deleted_at') deletedAt?: Date;
}
