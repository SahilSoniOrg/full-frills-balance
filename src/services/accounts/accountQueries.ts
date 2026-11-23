import { AccountType } from '@/src/types/enums';
import { AccountId, WorkplaceId } from '@/src/types/ids';

import { toPlainAccount, toPlainAccountMetadata, toPlainAccounts } from '@/src/data/models/Account';
import { accountQueryRepository, accountObserveQueries } from '@/src/data/repositories/account';
import { transactionObserveQueries } from '@/src/data/repositories/transaction';
import {
  resolvePlainAccountIcon,
  resolvePlainAccountIcons,
} from '@/src/presentation/mappers/accountPlainMapper';
import { observeWorkplaceAccounts } from '@/src/services/reactive/reactiveWorkplaceObserves';
import { map } from 'rxjs';

const toPresentedAccounts = (accounts: Parameters<typeof toPlainAccounts>[0]) =>
  resolvePlainAccountIcons(toPlainAccounts(accounts));

const toPresentedAccount = (account: Parameters<typeof toPlainAccount>[0]) =>
  resolvePlainAccountIcon(toPlainAccount(account));

export const accountQueries = {
  observeAll(workplaceId: WorkplaceId) {
    return observeWorkplaceAccounts(workplaceId).pipe(map(toPresentedAccounts));
  },

  observeById(workplaceId: WorkplaceId, accountId: AccountId) {
    return accountObserveQueries
      .observeById(workplaceId, accountId)
      .pipe(map(account => (account ? toPresentedAccount(account) : null)));
  },

  observeArchivedAt(workplaceId: WorkplaceId, accountId: AccountId) {
    return accountObserveQueries.observeArchivedAt(workplaceId, accountId);
  },

  observeReconciledAt(workplaceId: WorkplaceId, accountId: AccountId) {
    return accountObserveQueries.observeReconciledAt(workplaceId, accountId);
  },

  observeByType(workplaceId: WorkplaceId, accountType: AccountType) {
    return accountObserveQueries
      .observeByType(workplaceId, accountType)
      .pipe(map(toPresentedAccounts));
  },

  observeByIds(workplaceId: WorkplaceId, accountIds: AccountId[]) {
    return accountObserveQueries
      .observeByIds(workplaceId, accountIds)
      .pipe(map(toPresentedAccounts));
  },

  observeHasChildren(workplaceId: WorkplaceId, accountId: AccountId) {
    return accountObserveQueries.observeHasChildren(workplaceId, accountId);
  },

  observeTransactionCountIncludingDeleted(workplaceId: WorkplaceId, accountId: AccountId) {
    return transactionObserveQueries.observeCountByAccountIncludingDeleted(workplaceId, accountId);
  },

  observeByIdsWithDeleted(workplaceId: WorkplaceId, accountIds: AccountId[]) {
    return accountObserveQueries
      .observeByIdsWithDeleted(workplaceId, accountIds)
      .pipe(map(toPresentedAccounts));
  },

  observeMetadata(workplaceId: WorkplaceId, accountId: AccountId) {
    return accountObserveQueries
      .observeMetadata(workplaceId, accountId)
      .pipe(map(records => records.map(toPlainAccountMetadata)));
  },

  async findAll(workplaceId: WorkplaceId) {
    return toPresentedAccounts(await accountQueryRepository.findAll(workplaceId));
  },

  async findAllByIds(workplaceId: WorkplaceId, accountIds: AccountId[]) {
    return toPresentedAccounts(await accountQueryRepository.findAllByIds(workplaceId, accountIds));
  },
};
