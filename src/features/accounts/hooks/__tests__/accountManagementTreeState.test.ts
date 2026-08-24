import type { AccountFields } from '@/src/types/domain';
import {
  accountManagementTreeReducer,
  applyPendingTreePatch,
  initialAccountManagementTreeState,
  planManagementMove,
} from '../accountManagementTreeState';

const accounts = [
  { id: 'a', accountType: 'ASSET', orderNum: 0 },
  { id: 'b', accountType: 'ASSET', orderNum: 1 },
] as unknown as AccountFields[];

describe('account management tree state', () => {
  it('applies a pending move and restores the source state on failure', () => {
    const patch = planManagementMove(accounts, {
      accountId: 'a' as never,
      parentId: null,
      siblingIndex: 1,
    });
    const pending = applyPendingTreePatch(accounts, patch);

    expect(pending.map(account => account.id)).toEqual(['a', 'b']);
    expect(pending.map(account => account.orderNum)).toEqual([1, 0]);
    expect(
      accountManagementTreeReducer(
        { pendingPatch: patch, savingAccountId: 'a' as never },
        { type: 'failed' },
      ),
    ).toEqual(initialAccountManagementTreeState);
  });

  it('clears the optimistic patch only after the source catches up', () => {
    const patch = planManagementMove(accounts, {
      accountId: 'a' as never,
      parentId: null,
      siblingIndex: 1,
    });
    const state = { pendingPatch: patch, savingAccountId: null as null };
    expect(accountManagementTreeReducer(state, { type: 'sourceUpdated', accounts })).toBe(state);
    expect(
      accountManagementTreeReducer(state, {
        type: 'sourceUpdated',
        accounts: applyPendingTreePatch(accounts, patch),
      }),
    ).toEqual(initialAccountManagementTreeState);
  });
});
