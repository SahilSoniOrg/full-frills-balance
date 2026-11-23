import {
  stageModelWrite,
  type AccountingWriteSession,
} from '@/src/data/repositories/AccountingWriteSession';
import Budget from '@/src/data/models/Budget';
import BudgetScope from '@/src/data/models/BudgetScope';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import {
  parseFundingAccountIds,
  persistFundingAccountIds,
} from '@/src/domain/budget/fundingAccountIds';
import { AuditAction } from '@/src/types/enums';
import { AccountId, BudgetId, WorkplaceId } from '@/src/types/ids';
import { Model, Q } from '@nozbe/watermelondb';
import { auditBudgetState } from './budgetAudit';
import { budgetsCollection, budgetScopesCollection } from './budgetCollections';
import type { BudgetMergeRecords } from './budgetTypes';

export type BudgetMergeLoaders = {
  findAllScopesByAccountIds: (
    workplaceId: WorkplaceId,
    accountIds: AccountId[],
  ) => Promise<BudgetScope[]>;
  findAllWithAssetAccountIds: (workplaceId: WorkplaceId) => Promise<Budget[]>;
};

async function loadBudgetMergeRecords(
  workplaceId: WorkplaceId,
  sourceAccountIds: AccountId[],
  targetAccountId: AccountId,
  loaders: BudgetMergeLoaders,
): Promise<BudgetMergeRecords> {
  const [affectedScopes, allBudgets] = await Promise.all([
    loaders.findAllScopesByAccountIds(workplaceId, [...sourceAccountIds, targetAccountId]),
    loaders.findAllWithAssetAccountIds(workplaceId),
  ]);
  const sourceIds = new Set(sourceAccountIds);
  const budgets = allBudgets.filter(budget =>
    parseFundingAccountIds(budget.assetAccountIds).some(id => sourceIds.has(id as AccountId)),
  );
  const budgetIds = [
    ...new Set([
      ...affectedScopes.map(scope => scope.budget.id),
      ...budgets.map(budget => budget.id),
    ]),
  ];
  if (budgetIds.length === 0) return { scopes: [], budgets: [] };
  const [allAffectedScopes, affectedBudgets] = await Promise.all([
    budgetScopesCollection()
      .query(Q.where('workplace_id', workplaceId), Q.where('budget_id', Q.oneOf(budgetIds)))
      .fetch(),
    budgetsCollection()
      .query(Q.where('workplace_id', workplaceId), Q.where('id', Q.oneOf(budgetIds)))
      .fetch(),
  ]);
  return { scopes: allAffectedScopes, budgets: affectedBudgets };
}

function prepareLoadedBudgetMergeOperations(
  { scopes, budgets }: BudgetMergeRecords,
  sourceAccountIds: AccountId[],
  targetAccountId: AccountId,
  correlationId?: string,
): Model[] {
  const sourceIds = new Set(sourceAccountIds);
  const scopesByBudget = new Map<string, BudgetScope[]>();
  const budgetsById = new Map(budgets.map(budget => [budget.id, budget]));

  for (const scope of scopes) {
    const budgetScopes = scopesByBudget.get(scope.budget.id) ?? [];
    budgetScopes.push(scope);
    scopesByBudget.set(scope.budget.id, budgetScopes);
  }

  const scopeIdsByBudget = new Map(
    [...scopesByBudget].map(([budgetId, budgetScopes]) => [
      budgetId,
      budgetScopes.map(scope => scope.accountId),
    ]),
  );
  const scopeOps: BudgetScope[] = [];
  const changedBudgetIds = new Set<string>();
  for (const budgetScopes of scopesByBudget.values()) {
    const targetScope = budgetScopes.find(scope => scope.accountId === targetAccountId);
    const sourceScopes = budgetScopes.filter(scope => sourceIds.has(scope.accountId));
    if (sourceScopes.length > 0) changedBudgetIds.add(budgetScopes[0].budget.id);
    if (targetScope) {
      scopeOps.push(...sourceScopes.map(scope => scope.prepareDestroyPermanently()));
    } else if (sourceScopes.length > 0) {
      scopeOps.push(
        sourceScopes[0].prepareUpdate(record => {
          record.accountId = targetAccountId;
          record.updatedAt = new Date();
        }),
        ...sourceScopes.slice(1).map(scope => scope.prepareDestroyPermanently()),
      );
    }
  }

  const budgetOps: Budget[] = [];
  const budgetAuditOps: Model[] = [];
  for (const budget of budgets) {
    if (!budget.assetAccountIds) continue;

    let changed = false;
    const accountIds = parseFundingAccountIds(budget.assetAccountIds).map(id => {
      if (sourceIds.has(id as AccountId)) {
        changed = true;
        return targetAccountId;
      }
      return id as AccountId;
    });

    if (changed) {
      const before = auditBudgetState(budget, scopeIdsByBudget.get(budget.id) ?? []);
      const nextAssetAccountIds = [...new Set(accountIds)];
      const afterScopes = (scopeIdsByBudget.get(budget.id) ?? []).filter(
        accountId => !sourceIds.has(accountId),
      );
      if (
        (scopeIdsByBudget.get(budget.id) ?? []).some(accountId => sourceIds.has(accountId)) &&
        !afterScopes.includes(targetAccountId)
      ) {
        afterScopes.push(targetAccountId);
      }
      const after = {
        ...before,
        assetAccountIds: nextAssetAccountIds,
        scopedAccountIds: [...new Set(afterScopes)],
      };
      budgetOps.push(
        budget.prepareUpdate(record => {
          record.assetAccountIds = persistFundingAccountIds(nextAssetAccountIds);
          record.updatedAt = new Date();
        }),
      );
      budgetAuditOps.push(
        auditRepository.prepareLog(
          {
            entityType: 'budget',
            entityId: budget.id,
            eventType: 'budget.accounts_retargeted',
            action: AuditAction.UPDATE,
            source: 'app',
            correlationId,
            changes: { before, after },
            undoable: false,
          },
          budget.workplaceId,
        ),
      );
    }
  }

  // Scope-only budgets also need an event, even if their funding account list is unchanged.
  for (const budgetId of changedBudgetIds) {
    if (budgetOps.some(operation => operation.id === budgetId)) continue;
    const budget = budgetsById.get(budgetId as BudgetId);
    if (!budget) continue;
    const before = auditBudgetState(budget, scopeIdsByBudget.get(budgetId) ?? []);
    const afterScopeIds = (scopeIdsByBudget.get(budgetId) ?? []).filter(
      accountId => !sourceIds.has(accountId),
    );
    if (!afterScopeIds.includes(targetAccountId)) afterScopeIds.push(targetAccountId);
    budgetAuditOps.push(
      auditRepository.prepareLog(
        {
          entityType: 'budget',
          entityId: budget.id,
          eventType: 'budget.accounts_retargeted',
          action: AuditAction.UPDATE,
          source: 'app',
          correlationId,
          changes: {
            before,
            after: { ...before, scopedAccountIds: [...new Set(afterScopeIds)] },
          },
          undoable: false,
        },
        budget.workplaceId,
      ),
    );
  }

  return [...scopeOps, ...budgetOps, ...budgetAuditOps];
}

/**
 * Prepares WatermelonDB operations to merge budget references from source accounts
 * into a target account.
 */
export async function mergeBudgetAccountsInSession(
  session: AccountingWriteSession,
  workplaceId: WorkplaceId,
  sourceAccountIds: AccountId[],
  targetAccountId: AccountId,
  loaders: BudgetMergeLoaders,
  correlationId?: string,
): Promise<void> {
  const records = await loadBudgetMergeRecords(
    workplaceId,
    sourceAccountIds,
    targetAccountId,
    loaders,
  );
  stageModelWrite(session, () =>
    prepareLoadedBudgetMergeOperations(records, sourceAccountIds, targetAccountId, correlationId),
  );
}
