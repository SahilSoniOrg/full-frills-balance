import { AccountId, WorkplaceId } from '@/src/types/ids';
import { AccountType } from '@/src/types/enums';
import { Q } from '@nozbe/watermelondb';

export interface AccountFilter {
  workplaceId: WorkplaceId;
  accountIds?: readonly AccountId[];
  accountType?: AccountType;
  parentAccountId?: AccountId | null;
  name?: string;
  includeDeleted?: boolean;
  sortByOrder?: boolean;
}

export function buildAccountClauses(filter: AccountFilter): Q.Clause[] {
  const clauses: Q.Clause[] = [Q.where('workplace_id', filter.workplaceId)];

  if (filter.accountIds) clauses.push(Q.where('id', Q.oneOf([...filter.accountIds])));
  if (filter.accountType) clauses.push(Q.where('account_type', filter.accountType));
  if (filter.name !== undefined) clauses.push(Q.where('name', filter.name));
  if ('parentAccountId' in filter) {
    clauses.push(
      Q.where(
        'parent_account_id',
        filter.parentAccountId == null ? Q.eq(null) : filter.parentAccountId,
      ),
    );
  }
  if (!filter.includeDeleted) clauses.push(Q.where('deleted_at', Q.eq(null)));
  if (filter.sortByOrder) clauses.push(Q.sortBy('order_num', Q.asc));

  return clauses;
}
