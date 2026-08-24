import type { AccountFields, AccountId } from '@/src/types/domain';
import type { AccountTreeMove } from '@/src/services/accounts/accountTree';
import { planAccountTreeMove } from '@/src/services/accounts/accountTree';

export type TreePatch = Map<AccountId, { parentAccountId?: AccountId; orderNum: number }>;

export interface AccountManagementTreeState {
  pendingPatch: TreePatch | null;
  savingAccountId: AccountId | null;
}

type TreeAction =
  | { type: 'begin'; accountId: AccountId; patch: TreePatch }
  | { type: 'failed' }
  | { type: 'finished' }
  | { type: 'sourceUpdated'; accounts: readonly AccountFields[] };

export const initialAccountManagementTreeState: AccountManagementTreeState = {
  pendingPatch: null,
  savingAccountId: null,
};

export function accountManagementTreeReducer(
  state: AccountManagementTreeState,
  action: TreeAction,
): AccountManagementTreeState {
  switch (action.type) {
    case 'begin':
      return { pendingPatch: action.patch, savingAccountId: action.accountId };
    case 'failed':
      return initialAccountManagementTreeState;
    case 'finished':
      return { ...state, savingAccountId: null };
    case 'sourceUpdated':
      if (!state.pendingPatch || !isPatchApplied(state.pendingPatch, action.accounts)) return state;
      return initialAccountManagementTreeState;
  }
}

export function applyPendingTreePatch(
  accounts: readonly AccountFields[],
  patch: TreePatch | null,
): AccountFields[] {
  if (!patch) return [...accounts];
  return accounts.map(account => {
    const update = patch.get(account.id);
    return update ? { ...account, ...update } : account;
  });
}

export function planManagementMove(
  accounts: readonly AccountFields[],
  move: AccountTreeMove,
): TreePatch {
  return planAccountTreeMove(accounts, move);
}

function isPatchApplied(patch: TreePatch, accounts: readonly AccountFields[]): boolean {
  const byId = new Map(accounts.map(account => [account.id, account]));
  return [...patch].every(([id, update]) => {
    const account = byId.get(id);
    return (
      account &&
      account.orderNum === update.orderNum &&
      (account.parentAccountId || undefined) === update.parentAccountId
    );
  });
}
