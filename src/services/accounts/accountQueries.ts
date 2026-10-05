import { AccountType } from '@/src/types/enums';
import { AccountId, WorkplaceId } from '@/src/types/ids';

import { accountQueryRepository, accountObserveQueries } from '@/src/data/repositories/account';
import { observeWorkplaceAccounts } from '@/src/services/reactive/reactiveWorkplaceObserves';
import { map } from 'rxjs';
import { toPlainAccount, toPlainAccountMetadata, toPlainAccounts } from '@/src/data/models/Account';

export const accountQueries = {
  observeAll(workplaceId: WorkplaceId) {
    return observeWorkplaceAccounts(workplaceId).pipe(map(toPlainAccounts));
  },

  observeById(workplaceId: WorkplaceId, accountId: AccountId) {
    return accountObserveQueries
      .observeById(workplaceId, accountId)
      .pipe(map(account => (account ? toPlainAccount(account) : null)));
  },

  observeArchivedAt(workplaceId: WorkplaceId, accountId: AccountId) {
    return accountObserveQueries.observeArchivedAt(workplaceId, accountId);
  },

  observeReconciledAt(workplaceId: WorkplaceId, accountId: AccountId) {
    return accountObserveQueries.observeReconciledAt(workplaceId, accountId);
  },

  observeByType(workplaceId: WorkplaceId, accountType: AccountType) {
    return accountObserveQueries.observeByType(workplaceId, accountType).pipe(map(toPlainAccounts));
  },

  observeByIds(workplaceId: WorkplaceId, accountIds: AccountId[]) {
    return accountObserveQueries.observeByIds(workplaceId, accountIds).pipe(map(toPlainAccounts));
  },

  observeHasChildren(workplaceId: WorkplaceId, accountId: AccountId) {
    return accountObserveQueries.observeHasChildren(workplaceId, accountId);
  },

  observeByIdsWithDeleted(workplaceId: WorkplaceId, accountIds: AccountId[]) {
    return accountObserveQueries
      .observeByIdsWithDeleted(workplaceId, accountIds)
      .pipe(map(toPlainAccounts));
  },

  observeMetadata(workplaceId: WorkplaceId, accountId: AccountId) {
    return accountObserveQueries
      .observeMetadata(workplaceId, accountId)
      .pipe(map(records => records.map(toPlainAccountMetadata)));
  },

  async findAll(workplaceId: WorkplaceId) {
    return toPlainAccounts(await accountQueryRepository.findAll(workplaceId));
  },
};
