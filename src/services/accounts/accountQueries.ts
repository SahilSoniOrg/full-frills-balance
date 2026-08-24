import { AccountType } from '@/src/types/enums';
import { AccountId, WorkplaceId } from '@/src/types/ids';

import { accountObserveQueries, accountQueryRepository } from '@/src/data/repositories/account';
import { map } from 'rxjs';
import { toPlainAccount, toPlainAccountMetadata, toPlainAccounts } from '@/src/data/models/Account';

/**
 * Curated reactive/read entry points for feature hooks.
 * Add methods only when a production feature hook needs them.
 */
export const accountQueries = {
  observeAll(workplaceId: WorkplaceId) {
    return accountObserveQueries.observeAll(workplaceId).pipe(map(toPlainAccounts));
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

  observeHasChildren(workplaceId: WorkplaceId, accountId: AccountId) {
    return accountObserveQueries.observeHasChildren(workplaceId, accountId);
  },

  observeSubAccountCount(workplaceId: WorkplaceId, accountId: AccountId) {
    return accountObserveQueries.observeSubAccountCount(workplaceId, accountId);
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
