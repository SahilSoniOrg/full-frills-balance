/**
 * Account mutation hooks — thin wrappers over named command modules (ADR-0008).
 */
import { IconName } from '@/src/components/core';
import Account, { AccountSubtype, AccountType } from '@/src/data/models/Account';
import {
  deleteAccount as deleteAccountCommand,
  recoverAccount as recoverAccountCommand,
} from '@/src/services/accounts/accountDeleteCommands';
import { reconcileAccount as reconcileAccountCommand } from '@/src/services/accounts/accountReconcileCommands';
import { adjustAccountBalance } from '@/src/services/accounts/accountAdjustCommands';
import { BalanceChangeCounterparty } from '@/src/services/accounts/balanceChangeClassification';
import { createAccount as createAccountCommand } from '@/src/services/accounts/accountCommands';
import {
  updateAccount as updateAccountCommand,
  updateAccountOrder as updateAccountOrderCommand,
} from '@/src/services/accounts/accountHierarchyCommands';
import { mergeAccounts as mergeAccountsCommand } from '@/src/services/accounts/accountMergeCommands';
import { findAccountByName as findAccountByNameQuery } from '@/src/services/accounts/accountSystemAccounts';
import { AccountId, WorkplaceId } from '@/src/types/domain';
import { useCallback } from 'react';

/** CRUD + management actions. Prefer importing this over the fat `useAccounts` module. */
export function useAccountActions(workplaceId: WorkplaceId) {
  const createAccount = useCallback(
    async (data: {
      name: string;
      accountType: AccountType;
      accountSubtype?: AccountSubtype;
      currencyCode: string;
      icon?: IconName;
      initialBalance?: number;
      parentAccountId?: AccountId | null;
      metadata?: import('@/src/data/repositories/AccountRepository').AccountPersistenceInput['metadata'];
    }) => {
      return createAccountCommand(workplaceId, { ...data, workplaceId });
    },
    [workplaceId],
  );

  const updateAccount = useCallback(
    async (
      account: Account,
      data: {
        name?: string;
        accountType?: AccountType;
        accountSubtype?: AccountSubtype;
        currencyCode?: string;
        description?: string;
        icon?: IconName;
        parentAccountId?: AccountId | null;
        metadata?: import('@/src/data/repositories/AccountRepository').AccountPersistenceInput['metadata'];
      },
    ) => {
      return updateAccountCommand(workplaceId, account.id as AccountId, data);
    },
    [workplaceId],
  );

  const deleteAccount = useCallback(
    async (account: Account) => {
      return deleteAccountCommand(account, workplaceId);
    },
    [workplaceId],
  );

  const recoverAccount = useCallback(
    async (accountId: AccountId) => {
      return recoverAccountCommand(accountId, workplaceId);
    },
    [workplaceId],
  );

  const updateAccountOrder = useCallback(
    async (account: Account, newOrder: number) => {
      return updateAccountOrderCommand(workplaceId, account, newOrder);
    },
    [workplaceId],
  );

  const findAccountByName = useCallback(
    async (name: string) => {
      return findAccountByNameQuery(workplaceId, name);
    },
    [workplaceId],
  );

  const adjustBalance = useCallback(
    async (account: Account, targetBalance: number, counterparty?: BalanceChangeCounterparty) => {
      return adjustAccountBalance(workplaceId, account, targetBalance, counterparty);
    },
    [workplaceId],
  );

  const reconcileAccount = useCallback(
    async (accountId: AccountId, date: Date) => {
      return reconcileAccountCommand(accountId, date, workplaceId);
    },
    [workplaceId],
  );

  const mergeAccounts = useCallback(
    async (targetAccountId: AccountId, sourceAccountIds: AccountId[]) => {
      return mergeAccountsCommand(workplaceId, targetAccountId, sourceAccountIds);
    },
    [workplaceId],
  );

  return {
    createAccount,
    updateAccount,
    deleteAccount,
    recoverAccount,
    updateAccountOrder,
    findAccountByName,
    adjustBalance,
    reconcileAccount,
    mergeAccounts,
  };
}
