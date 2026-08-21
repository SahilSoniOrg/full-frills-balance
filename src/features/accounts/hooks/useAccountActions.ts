import {
  AccountSubtype,
  AccountType,
  AccountId,
  SerializedAccountMetadataPayload,
  WorkplaceId,
} from '@/src/types/domain';
/**
 * Account mutation hooks — thin wrappers over named command modules (ADR-0008).
 */
import { IconName } from '@/src/components/core';
import {
  deleteAccount as deleteAccountCommand,
  recoverAccount as recoverAccountCommand,
} from '@/src/services/accounts/accountDeleteCommands';
import { reconcileAccount as reconcileAccountCommand } from '@/src/services/accounts/accountReconcileCommands';
import { adjustAccountBalance } from '@/src/services/accounts/accountAdjustCommands';
import { BalanceChangeCounterparty } from '@/src/services/accounts/balanceChangeClassification';
import { createAccount as createAccountCommand } from '@/src/services/accounts/accountCommands';
import { applyAccountArchiveChanges } from '@/src/services/accounts/accountArchiveCommands';
import {
  updateAccount as updateAccountCommand,
  updateAccountOrder as updateAccountOrderCommand,
} from '@/src/services/accounts/accountHierarchyCommands';
import { mergeAccounts as mergeAccountsCommand } from '@/src/services/accounts/accountMergeCommands';
import { AccountArchiveChanges } from '@/src/utils/accountArchive';
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
      color?: string;
      initialBalance?: number;
      parentAccountId?: AccountId | null;
      metadata?: Partial<SerializedAccountMetadataPayload>;
    }) => {
      return createAccountCommand(workplaceId, { ...data, workplaceId });
    },
    [workplaceId],
  );

  const updateAccount = useCallback(
    async (
      account: { id: AccountId },
      data: {
        name?: string;
        accountType?: AccountType;
        accountSubtype?: AccountSubtype;
        currencyCode?: string;
        description?: string;
        icon?: IconName;
        color?: string;
        parentAccountId?: AccountId | null;
        metadata?: Partial<SerializedAccountMetadataPayload>;
      },
    ) => {
      return updateAccountCommand(workplaceId, account.id, data);
    },
    [workplaceId],
  );

  const applyArchiveChanges = useCallback(
    async (changes: AccountArchiveChanges) => {
      return applyAccountArchiveChanges(workplaceId, changes);
    },
    [workplaceId],
  );

  const deleteAccount = useCallback(
    async (accountId: AccountId) => {
      return deleteAccountCommand(accountId, workplaceId);
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
    async (account: { id: AccountId }, newOrder: number) => {
      return updateAccountOrderCommand(workplaceId, account.id, newOrder);
    },
    [workplaceId],
  );

  const adjustBalance = useCallback(
    async (
      account: { id: AccountId; name: string; currencyCode: string; accountType: AccountType },
      targetBalance: number,
      counterparty?: BalanceChangeCounterparty,
    ) => {
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
    applyArchiveChanges,
    deleteAccount,
    recoverAccount,
    updateAccountOrder,
    adjustBalance,
    reconcileAccount,
    mergeAccounts,
  };
}
