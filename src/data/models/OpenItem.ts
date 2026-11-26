import BaseScopedModel from '@/src/data/models/BaseScopedModel';
import type { OpenItemId, PersonId, AccountId, JournalId } from '@/src/types/ids';
import { date, field } from '@nozbe/watermelondb/decorators';
export default class OpenItem extends BaseScopedModel<OpenItemId> {
  static table = 'open_items';
  @field('person_id') personId!: PersonId;
  @field('originating_journal_id') originatingJournalId!: JournalId;
  @field('account_id') accountId!: AccountId;
  @field('direction') direction!: 'receivable' | 'payable';
  @field('original_amount') originalAmount!: number;
  @field('currency_code') currencyCode!: string;
  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
  @date('deleted_at') deletedAt?: Date;
}
export const toPlainOpenItem = (x: OpenItem) => ({
  id: x.id,
  personId: x.personId,
  originatingJournalId: x.originatingJournalId,
  accountId: x.accountId,
  direction: x.direction,
  originalAmount: x.originalAmount,
  currencyCode: x.currencyCode,
  createdAt: x.createdAt?.getTime(),
  updatedAt: x.updatedAt?.getTime(),
  deletedAt: x.deletedAt?.getTime(),
});
