import { AccountType, AccountId, WorkplaceId } from '@/src/types/domain';

import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { map } from 'rxjs';
import {
  toPlainAccount,
  toPlainAccountMetadata,
  toPlainAccounts,
} from '@/src/services/accounts/accountPlainMap';

/**
 * Curated reactive/read entry points for feature hooks.
 * Add methods only when a production feature hook needs them.
 */
export const accountQueries = {
  observeAll(workplaceId: WorkplaceId) {
    return accountRepository.observeAll(workplaceId).pipe(map(toPlainAccounts));
  },

  observeById(workplaceId: WorkplaceId, accountId: AccountId) {
    return accountRepository
      .observeById(workplaceId, accountId)
      .pipe(map(account => (account ? toPlainAccount(account) : null)));
  },

  observeArchivedAt(workplaceId: WorkplaceId, accountId: AccountId) {
    return accountRepository.observeArchivedAt(workplaceId, accountId);
  },

  observeReconciledAt(workplaceId: WorkplaceId, accountId: AccountId) {
    return accountRepository.observeReconciledAt(workplaceId, accountId);
  },

  observeByType(workplaceId: WorkplaceId, accountType: AccountType) {
    return accountRepository.observeByType(workplaceId, accountType).pipe(map(toPlainAccounts));
  },

  observeHasChildren(workplaceId: WorkplaceId, accountId: AccountId) {
    return accountRepository.observeHasChildren(workplaceId, accountId);
  },

  observeSubAccountCount(workplaceId: WorkplaceId, accountId: AccountId) {
    return accountRepository.observeSubAccountCount(workplaceId, accountId);
  },

  observeByIdsWithDeleted(workplaceId: WorkplaceId, accountIds: AccountId[]) {
    return accountRepository
      .observeByIdsWithDeleted(workplaceId, accountIds)
      .pipe(map(toPlainAccounts));
  },

  observeMetadata(workplaceId: WorkplaceId, accountId: AccountId) {
    return accountRepository
      .observeMetadata(workplaceId, accountId)
      .pipe(map(records => records.map(toPlainAccountMetadata)));
  },

  findAll(workplaceId: WorkplaceId) {
    return accountRepository.findAll(workplaceId);
  },
};
