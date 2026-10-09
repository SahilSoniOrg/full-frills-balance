import {
  accountTreeTransactionCoordinator,
  accountWriteRepository,
} from '@/src/data/repositories/account';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import { deleteBlockers } from '@/src/services/accounts/accountReferenceGraph';
import {
  createAccountTreeSnapshot,
  getAccountTreeSiblingListKey,
  planFromSiblingLists,
  validateAccountTreeStructure,
} from '@/src/services/accounts/accountTree';
import { AuditAction } from '@/src/types/enums';
import type { AccountId, WorkplaceId } from '@/src/types/ids';

/** Remove one container, promoting its direct children without touching their subtrees or journals. */
export async function disbandAccountGroup(workplaceId: WorkplaceId, accountId: AccountId) {
  await accountTreeTransactionCoordinator.run(workplaceId, async accounts => {
    const tree = createAccountTreeSnapshot(accounts);
    const group = tree.accountsById.get(accountId);
    if (!group) throw new Error('Group not found in this workplace');
    const children = tree.getChildren(accountId);
    if (children.length === 0) throw new Error('This account is no longer a group');

    // Children are the only references this operation removes. All other live references must remain guarded.
    const blockers = (await deleteBlockers(workplaceId, accountId)).filter(
      blocker => blocker.code !== 'child_accounts',
    );
    if (blockers.length > 0) {
      const references = blockers.map(blocker => `${blocker.count} ${blocker.label}`).join(', ');
      throw new Error(
        `Group "${group.name}" cannot be disbanded while referenced by ${references}. ` +
          'Remove or retarget those references first.',
      );
    }

    const parentAccountId = group.parentAccountId || undefined;
    const siblingListKey = getAccountTreeSiblingListKey(parentAccountId, group.accountType);
    const replacement = tree
      .getChildren(parentAccountId ?? null, group.accountType)
      .flatMap(sibling => (sibling.id === accountId ? children : [sibling]));
    const placements = planFromSiblingLists(accounts, new Map([[siblingListKey, replacement]]));
    validateAccountTreeStructure(
      accounts
        .filter(account => account.id !== accountId)
        .map(account => ({
          id: account.id,
          accountType: account.accountType,
          parentAccountId: account.parentAccountId,
          orderNum: account.orderNum,
          ...placements.get(account.id),
        })),
      { siblingListKeys: new Set([siblingListKey]) },
    );
    const deletedAt = new Date();
    const groupBefore = {
      name: group.name,
      parentAccountId: group.parentAccountId,
      deletedAt: group.deletedAt,
    };
    const changedAccounts = [...placements].map(([id, placement]) => {
      const account = tree.accountsById.get(id)!;
      return {
        account,
        placement,
        before: { parentAccountId: account.parentAccountId, orderNum: account.orderNum },
      };
    });

    return {
      result: undefined,
      prepareOps: () => [
        ...changedAccounts.flatMap(({ account, placement, before }) => {
          return [
            ...accountWriteRepository.prepareUpdateBatchOps(account, placement, null),
            auditRepository.prepareLog(
              {
                entityType: 'account',
                entityId: account.id,
                action: AuditAction.UPDATE,
                eventType: 'account.hierarchy_retargeted',
                undoable: false,
                changes: {
                  before,
                  after: placement,
                  reason: 'group_disbanded',
                  groupId: accountId,
                },
              },
              workplaceId,
            ),
          ];
        }),
        ...accountWriteRepository.prepareUpdateBatchOps(group, { deletedAt }, null),
        auditRepository.prepareLog(
          {
            entityType: 'account',
            entityId: accountId,
            action: AuditAction.DELETE,
            eventType: 'account.group_disbanded',
            undoable: false,
            changes: {
              before: groupBefore,
              after: { deletedAt },
              promotedAccountIds: children.map(child => child.id),
            },
          },
          workplaceId,
        ),
      ],
    };
  });
}
