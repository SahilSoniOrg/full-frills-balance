import { AccountType, AccountId, WorkplaceId } from '@/src/types/domain';

import { accountRepository } from '@/src/data/repositories/AccountRepository';

/**
 * Curated reactive/read entry points for feature hooks.
 * Add methods only when a production feature hook needs them.
 */
export const accountQueries = {
  observeAll(workplaceId: WorkplaceId) {
    return accountRepository.observeAll(workplaceId);
  },

  observeById(workplaceId: WorkplaceId, accountId: AccountId) {
    return accountRepository.observeById(workplaceId, accountId);
  },

  observeByType(workplaceId: WorkplaceId, accountType: AccountType) {
    return accountRepository.observeByType(workplaceId, accountType);
  },

  observeHasChildren(workplaceId: WorkplaceId, accountId: AccountId) {
    return accountRepository.observeHasChildren(workplaceId, accountId);
  },

  observeSubAccountCount(workplaceId: WorkplaceId, accountId: AccountId) {
    return accountRepository.observeSubAccountCount(workplaceId, accountId);
  },

  observeByIdsWithDeleted(workplaceId: WorkplaceId, accountIds: AccountId[]) {
    return accountRepository.observeByIdsWithDeleted(workplaceId, accountIds);
  },

  findAll(workplaceId: WorkplaceId) {
    return accountRepository.findAll(workplaceId);
  },
};
