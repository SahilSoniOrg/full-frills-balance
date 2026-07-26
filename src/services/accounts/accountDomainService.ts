import Account from '@/src/data/models/Account';
import { adjustAccountBalance } from '@/src/services/accounts/accountAdjustCommands';
import { createAccount as runCreateAccount } from '@/src/services/accounts/accountCommands';
import {
  CreateAccountCommandInput,
  CreateAccountData,
} from '@/src/services/accounts/accountCommandInputs';
import {
  updateAccount as runUpdateAccount,
  updateAccountOrder as runUpdateAccountOrder,
} from '@/src/services/accounts/accountHierarchyCommands';
import { mergeAccounts as runMergeAccounts } from '@/src/services/accounts/accountMergeCommands';
import {
  deleteAccount as runDeleteAccount,
  recoverAccount as runRecoverAccount,
} from '@/src/services/accounts/accountDeleteCommands';
import { reconcileAccount as runReconcileAccount } from '@/src/services/accounts/accountReconcileCommands';
import {
  findAccountByName,
  findOrCreateBalanceCorrectionAccount,
  getOpeningBalancesAccountId,
} from '@/src/services/accounts/accountSystemAccounts';
import { AccountId, WorkplaceId } from '@/src/types/domain';

export type { CreateAccountCommandInput, CreateAccountData };

/** @deprecated Import command modules directly. Retained for tests and legacy call sites. */
export class AccountService {
  async createAccount(data: CreateAccountData, workplaceId: WorkplaceId): Promise<Account> {
    return runCreateAccount(workplaceId, data);
  }

  async updateAccount(
    accountId: AccountId,
    updates: Partial<CreateAccountData>,
    workplaceId: WorkplaceId,
  ): Promise<Account> {
    return runUpdateAccount(workplaceId, accountId, updates);
  }

  async reconcileAccount(accountId: AccountId, date: Date, workplaceId: WorkplaceId) {
    return runReconcileAccount(accountId, date, workplaceId);
  }

  async recoverAccount(accountId: AccountId, workplaceId: WorkplaceId): Promise<void> {
    return runRecoverAccount(accountId, workplaceId);
  }

  async updateAccountOrder(
    account: Account,
    newOrder: number,
    workplaceId: WorkplaceId,
  ): Promise<void> {
    return runUpdateAccountOrder(workplaceId, account, newOrder);
  }

  async deleteAccount(accountOrId: Account | AccountId, workplaceId: WorkplaceId): Promise<void> {
    return runDeleteAccount(accountOrId, workplaceId);
  }

  async getOpeningBalancesAccountId(
    currencyCode: string,
    workplaceId: WorkplaceId,
  ): Promise<AccountId> {
    return getOpeningBalancesAccountId(currencyCode, workplaceId);
  }

  async findAccountByName(workplaceId: WorkplaceId, name: string): Promise<Account | null> {
    return findAccountByName(workplaceId, name);
  }

  async adjustBalance(
    account: Account,
    targetBalance: number,
    workplaceId: WorkplaceId,
  ): Promise<void> {
    return adjustAccountBalance(workplaceId, account, targetBalance);
  }

  async findOrCreateBalanceCorrectionAccount(
    currencyCode: string,
    workplaceId: WorkplaceId,
  ): Promise<AccountId> {
    return findOrCreateBalanceCorrectionAccount(currencyCode, workplaceId);
  }

  async mergeAccounts(
    workplaceId: WorkplaceId,
    targetAccountId: AccountId,
    sourceAccountIds: AccountId[],
  ): Promise<void> {
    return runMergeAccounts(workplaceId, targetAccountId, sourceAccountIds);
  }
}

export const accountService = new AccountService();
