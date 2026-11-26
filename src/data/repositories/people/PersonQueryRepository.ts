import { database } from '@/src/data/database/Database';
import Person from '@/src/data/models/Person';
import PersonAccount from '@/src/data/models/PersonAccount';
import OpenItem from '@/src/data/models/OpenItem';
import SettlementAllocation from '@/src/data/models/SettlementAllocation';
import type { AccountId, JournalId, OpenItemId, PersonId, WorkplaceId } from '@/src/types/ids';
import { Q } from '@nozbe/watermelondb';

const scoped = (workplaceId: WorkplaceId, includeDeleted = false): Q.Clause[] => [
  Q.where('workplace_id', workplaceId),
  ...(!includeDeleted ? [Q.where('deleted_at', Q.eq(null))] : []),
];
export class PersonQueryRepository {
  private get people() {
    return database.collections.get<Person>('people');
  }
  private get links() {
    return database.collections.get<PersonAccount>('person_accounts');
  }
  private get items() {
    return database.collections.get<OpenItem>('open_items');
  }
  private get allocations() {
    return database.collections.get<SettlementAllocation>('settlement_allocations');
  }
  async findPerson(
    workplaceId: WorkplaceId,
    personId: PersonId,
    options: { includeDeleted?: boolean } = {},
  ) {
    return (
      (
        await this.people
          .query(...scoped(workplaceId, options.includeDeleted), Q.where('id', personId))
          .fetch()
      )[0] ?? null
    );
  }
  async listPeople(workplaceId: WorkplaceId, options: { includeArchived?: boolean } = {}) {
    return this.people
      .query(
        ...scoped(workplaceId),
        ...(!options.includeArchived ? [Q.where('archived_at', Q.eq(null))] : []),
        Q.sortBy('name', Q.asc),
      )
      .fetch();
  }
  listPersonAccounts(workplaceId: WorkplaceId, personId?: PersonId) {
    return this.links
      .query(...scoped(workplaceId), ...(personId ? [Q.where('person_id', personId)] : []))
      .fetch();
  }
  async findPersonAccountByAccountId(workplaceId: WorkplaceId, accountId: AccountId) {
    return (
      (
        await this.links.query(...scoped(workplaceId), Q.where('account_id', accountId)).fetch()
      )[0] ?? null
    );
  }
  listOpenItems(
    workplaceId: WorkplaceId,
    filter: { personId?: PersonId; originatingJournalId?: JournalId; accountId?: AccountId } = {},
  ) {
    return this.items
      .query(
        ...scoped(workplaceId),
        ...(filter.personId ? [Q.where('person_id', filter.personId)] : []),
        ...(filter.originatingJournalId
          ? [Q.where('originating_journal_id', filter.originatingJournalId)]
          : []),
        ...(filter.accountId ? [Q.where('account_id', filter.accountId)] : []),
      )
      .fetch();
  }
  listSettlementAllocations(
    workplaceId: WorkplaceId,
    filter: {
      personId?: PersonId;
      openItemId?: OpenItemId;
      settlementJournalId?: JournalId;
      activeOnly?: boolean;
    } = {},
  ) {
    return this.allocations
      .query(
        ...scoped(workplaceId),
        ...(filter.personId ? [Q.where('person_id', filter.personId)] : []),
        ...(filter.openItemId ? [Q.where('open_item_id', filter.openItemId)] : []),
        ...(filter.settlementJournalId
          ? [Q.where('settlement_journal_id', filter.settlementJournalId)]
          : []),
        ...(filter.activeOnly ? [Q.where('is_active', true)] : []),
      )
      .fetch();
  }
}
export const personQueryRepository = new PersonQueryRepository();
