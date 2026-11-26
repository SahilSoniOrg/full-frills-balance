import { database } from '@/src/data/database/Database';
import Person from '@/src/data/models/Person';
import PersonAccount from '@/src/data/models/PersonAccount';
import OpenItem from '@/src/data/models/OpenItem';
import SettlementAllocation from '@/src/data/models/SettlementAllocation';
import type { PersonId, WorkplaceId } from '@/src/types/ids';
import { Q } from '@nozbe/watermelondb';
const base = (workplaceId: WorkplaceId, personId?: PersonId): Q.Clause[] => [
  Q.where('workplace_id', workplaceId),
  Q.where('deleted_at', Q.eq(null)),
  ...(personId ? [Q.where('person_id', personId)] : []),
];
export class PersonObserveQueries {
  observePeople(workplaceId: WorkplaceId, options: { includeArchived?: boolean } = {}) {
    return database.collections
      .get<Person>('people')
      .query(
        ...base(workplaceId),
        ...(!options.includeArchived ? [Q.where('archived_at', Q.eq(null))] : []),
        Q.sortBy('name', Q.asc),
      )
      .observeWithColumns(['name', 'notes', 'color', 'archived_at', 'deleted_at', 'updated_at']);
  }
  observePerson(workplaceId: WorkplaceId, personId: PersonId) {
    return database.collections
      .get<Person>('people')
      .query(...base(workplaceId), Q.where('id', personId))
      .observeWithColumns(['name', 'notes', 'color', 'archived_at', 'deleted_at', 'updated_at']);
  }
  observePersonAccounts(workplaceId: WorkplaceId, personId?: PersonId) {
    return database.collections
      .get<PersonAccount>('person_accounts')
      .query(...base(workplaceId, personId))
      .observeWithColumns(['person_id', 'account_id', 'deleted_at', 'updated_at']);
  }
  observeOpenItems(workplaceId: WorkplaceId, personId?: PersonId) {
    return database.collections
      .get<OpenItem>('open_items')
      .query(...base(workplaceId, personId))
      .observeWithColumns([
        'person_id',
        'originating_journal_id',
        'account_id',
        'direction',
        'original_amount',
        'currency_code',
        'deleted_at',
        'updated_at',
      ]);
  }
  observeSettlementAllocations(workplaceId: WorkplaceId, personId?: PersonId) {
    return database.collections
      .get<SettlementAllocation>('settlement_allocations')
      .query(...base(workplaceId, personId))
      .observeWithColumns([
        'person_id',
        'open_item_id',
        'settlement_journal_id',
        'account_id',
        'allocation_kind',
        'amount',
        'is_active',
        'deleted_at',
        'updated_at',
      ]);
  }
}
export const personObserveQueries = new PersonObserveQueries();
