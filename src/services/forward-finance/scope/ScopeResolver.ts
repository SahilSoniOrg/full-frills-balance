import { AccountFields, AccountId } from '@/src/types/domain';

export class ScopeResolver {
  /**
   * Resolves root account IDs to all descendant account IDs (full subtree including descendants).
   * Safe against cycles in parent-child references.
   */
  static resolveDescendantAccountIds(
    rootAccountIds: (AccountId | string)[],
    allAccounts: (AccountFields | { id: string; parentAccountId?: string | null })[],
  ): Set<AccountId> {
    const childrenMap = this.buildChildrenMap(allAccounts);
    const result = new Set<AccountId>();

    for (const rootId of rootAccountIds) {
      if (!rootId) continue;
      const typedRootId = rootId as AccountId;
      result.add(typedRootId);
      this.traverseSubtree(typedRootId, childrenMap, result, new Set<string>([typedRootId]));
    }

    return result;
  }

  /**
   * Resolves root account IDs to strictly leaf posting accounts (accounts with no children).
   * Used for budget spend aggregations where transactions post only to leaf nodes.
   */
  static resolveLeafAccountIds(
    rootAccountIds: (AccountId | string)[],
    allAccounts: (AccountFields | { id: string; parentAccountId?: string | null })[],
  ): Set<AccountId> {
    const childrenMap = this.buildChildrenMap(allAccounts);
    const allDescendants = new Set<AccountId>();

    for (const rootId of rootAccountIds) {
      if (!rootId) continue;
      const typedRootId = rootId as AccountId;
      allDescendants.add(typedRootId);
      this.traverseSubtree(
        typedRootId,
        childrenMap,
        allDescendants,
        new Set<string>([typedRootId]),
      );
    }

    const leafAccountIds = new Set<AccountId>();
    for (const accountId of allDescendants) {
      const children = childrenMap.get(accountId);
      if (!children || children.length === 0) {
        leafAccountIds.add(accountId);
      }
    }

    return leafAccountIds;
  }

  private static buildChildrenMap(
    allAccounts: (AccountFields | { id: string; parentAccountId?: string | null })[],
  ): Map<string, string[]> {
    const childrenMap = new Map<string, string[]>();
    for (const acc of allAccounts) {
      if (acc.parentAccountId) {
        const siblings = childrenMap.get(acc.parentAccountId) || [];
        siblings.push(acc.id);
        childrenMap.set(acc.parentAccountId, siblings);
      }
    }
    return childrenMap;
  }

  private static traverseSubtree(
    currentId: string,
    childrenMap: Map<string, string[]>,
    result: Set<AccountId>,
    visited: Set<string>,
  ) {
    const children = childrenMap.get(currentId) || [];
    for (const childId of children) {
      if (visited.has(childId)) {
        // Cycle detected: prevent infinite loop
        continue;
      }
      visited.add(childId);
      result.add(childId as AccountId);
      this.traverseSubtree(childId, childrenMap, result, visited);
    }
  }
}
