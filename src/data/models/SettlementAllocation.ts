import BaseScopedModel from '@/src/data/models/BaseScopedModel';
import type {
  SettlementAllocationId,
  PersonId,
  OpenItemId,
  AccountId,
  JournalId,
} from '@/src/types/ids';
import { date, field } from '@nozbe/watermelondb/decorators';
export default class SettlementAllocation extends BaseScopedModel<SettlementAllocationId> {
  static table = 'settlement_allocations';
  @field('person_id') personId!: PersonId;
  @field('open_item_id') openItemId!: OpenItemId;
  @field('settlement_journal_id') settlementJournalId!: JournalId;
  @field('account_id') accountId!: AccountId;
  @field('allocation_kind') allocationKind!: 'repayment' | 'write_off' | 'auto_settle';
  @field('amount') amount!: number;
  @field('is_active') isActive!: boolean;
  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
  @date('deleted_at') deletedAt?: Date;
}
export const toPlainSettlementAllocation = (x: SettlementAllocation) => ({
  id: x.id,
  personId: x.personId,
  openItemId: x.openItemId,
  settlementJournalId: x.settlementJournalId,
  accountId: x.accountId,
  allocationKind: x.allocationKind,
  amount: x.amount,
  isActive: x.isActive,
  createdAt: x.createdAt?.getTime(),
  updatedAt: x.updatedAt?.getTime(),
  deletedAt: x.deletedAt?.getTime(),
});
