import { database } from '@/src/data/database/Database';
import {
  stageModelWrite,
  type AccountingWriteSession,
} from '@/src/data/repositories/AccountingWriteSession';
import Budget from '@/src/data/models/Budget';
import { observeQueryWithModelChanges } from '@/src/data/repositories/observeQueryWithModelChanges';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import {
  parseFundingAccountIds,
  persistFundingAccountIds,
} from '@/src/services/budget/budgetAssetAccountIds';
import { AuditAction } from '@/src/types/enums';
import { AccountId, BudgetId, WorkplaceId } from '@/src/types/ids';
import { Q } from '@nozbe/watermelondb';
import { map } from 'rxjs/operators';
import { auditBudgetState } from './budgetAudit';
import { budgetsCollection, budgetScopesCollection } from './budgetCollections';
import type { BudgetInput } from './budgetTypes';

export function observeAllActiveBudgets(workplaceId: WorkplaceId) {
  return observeQueryWithModelChanges(
    budgetsCollection().query(
      Q.where('workplace_id', workplaceId),
      Q.where('active', true),
      Q.sortBy('start_month', Q.desc),
    ),
  );
}

export function observeBudgetById(workplaceId: WorkplaceId, id: BudgetId) {
  return observeQueryWithModelChanges(
    budgetsCollection().query(Q.where('workplace_id', workplaceId), Q.where('id', id)),
  ).pipe(map(budgets => budgets[0] || null));
}

export async function findBudget(workplaceId: WorkplaceId, id: BudgetId): Promise<Budget | null> {
  const budgets = await budgetsCollection()
    .query(Q.where('workplace_id', workplaceId), Q.where('id', id))
    .fetch();
  return budgets[0] ?? null;
}

export function observeBudgetsByIds(workplaceId: WorkplaceId, ids: BudgetId[]) {
  return budgetsCollection()
    .query(Q.where('workplace_id', workplaceId), Q.where('id', Q.oneOf(ids)))
    .observe();
}

export async function findAllActiveBudgets(workplaceId: WorkplaceId): Promise<Budget[]> {
  return budgetsCollection()
    .query(Q.where('workplace_id', workplaceId), Q.where('active', true))
    .fetch();
}

export async function findAllBudgetsWithAssetAccountIds(
  workplaceId: WorkplaceId,
): Promise<Budget[]> {
  return await budgetsCollection()
    .query(Q.where('workplace_id', workplaceId), Q.where('asset_account_ids', Q.notEq(null)))
    .fetch();
}

/** Budgets whose funding collection includes this account id. */
export async function findAllBudgetsReferencingAssetAccountId(
  workplaceId: WorkplaceId,
  accountId: AccountId,
): Promise<Budget[]> {
  const candidates = await budgetsCollection()
    .query(Q.where('workplace_id', workplaceId), Q.where('asset_account_ids', Q.notEq(null)))
    .fetch();
  return candidates.filter(budget =>
    parseFundingAccountIds(budget.assetAccountIds).includes(accountId),
  );
}

export async function createBudget(
  workplaceId: WorkplaceId,
  data: BudgetInput,
  accountIds: AccountId[],
  validateReferences?: () => Promise<unknown>,
): Promise<Budget> {
  const budgets = budgetsCollection();
  const budgetScopes = budgetScopesCollection();
  return await database.write(async () => {
    await validateReferences?.();
    const budget = budgets.prepareCreate(record => {
      record.workplaceId = workplaceId;
      record.name = data.name;
      record.amount = data.amount;
      record.currencyCode = data.currencyCode;
      record.startMonth = data.startMonth;
      record.intervalType = data.intervalType || 'MONTHLY';
      record.intervalN = data.intervalN || 1;
      record.startDate = data.startDate;
      record.recurrenceDay = data.recurrenceDay;
      record.recurrenceMonth = data.recurrenceMonth;
      record.active = data.active ?? true;
      if (data.assetAccountIds)
        record.assetAccountIds = persistFundingAccountIds(data.assetAccountIds);
      record.createdAt = new Date();
      record.updatedAt = new Date();
    });

    const scopeCreates = accountIds.map(accountId =>
      budgetScopes.prepareCreate(scope => {
        scope.workplaceId = workplaceId;
        scope.budget.set(budget);
        scope.accountId = accountId;
        scope.createdAt = new Date();
        scope.updatedAt = new Date();
      }),
    );

    await database.batch(
      budget,
      ...scopeCreates,
      auditRepository.prepareLog(
        {
          entityType: 'budget',
          entityId: budget.id,
          eventType: 'budget.created',
          action: AuditAction.CREATE,
          changes: { after: auditBudgetState(budget, accountIds) },
          undoable: true,
        },
        workplaceId,
      ),
    );
    return budget;
  });
}

/** Stage a budget with a caller-supplied stable identity in an existing writer. */
export async function createBudgetInSession(
  session: AccountingWriteSession,
  workplaceId: WorkplaceId,
  id: BudgetId,
  data: BudgetInput,
  accountIds: AccountId[],
  correlationId?: string,
): Promise<Budget> {
  const budgets = budgetsCollection();
  const budgetScopes = budgetScopesCollection();
  const budget = budgets.prepareCreate(record => {
    record._raw.id = id;
    record.workplaceId = workplaceId;
    record.name = data.name;
    record.amount = data.amount;
    record.currencyCode = data.currencyCode;
    record.startMonth = data.startMonth;
    record.intervalType = data.intervalType || 'MONTHLY';
    record.intervalN = data.intervalN || 1;
    record.startDate = data.startDate;
    record.recurrenceDay = data.recurrenceDay;
    record.recurrenceMonth = data.recurrenceMonth;
    record.active = data.active ?? true;
    if (data.assetAccountIds)
      record.assetAccountIds = persistFundingAccountIds(data.assetAccountIds);
    record.createdAt = new Date();
    record.updatedAt = new Date();
  });
  const scopes = accountIds.map(accountId =>
    budgetScopes.prepareCreate(scope => {
      scope._raw.id = `${id}:scope:${accountId}`;
      scope.workplaceId = workplaceId;
      scope.budget.set(budget);
      scope.accountId = accountId;
      scope.createdAt = new Date();
      scope.updatedAt = new Date();
    }),
  );
  stageModelWrite(session, () => [
    budget,
    ...scopes,
    auditRepository.prepareLog(
      {
        entityType: 'budget',
        entityId: budget.id,
        eventType: 'budget.created',
        source: 'system',
        correlationId,
        action: AuditAction.CREATE,
        changes: { after: auditBudgetState(budget, accountIds) },
        undoable: false,
      },
      workplaceId,
    ),
  ]);
  return budget;
}

export async function updateBudget(
  workplaceId: WorkplaceId,
  budget: Budget,
  updates: Partial<BudgetInput>,
  accountIds: AccountId[],
  validateReferences?: () => Promise<unknown>,
): Promise<Budget> {
  const budgetScopes = budgetScopesCollection();
  return await database.write(async () => {
    await validateReferences?.();
    const existingScopes = await budgetScopes
      .query(Q.where('workplace_id', workplaceId), Q.where('budget_id', budget.id))
      .fetch();

    const existingBudget = await findBudget(workplaceId, budget.id);
    if (!existingBudget) {
      throw new Error('Budget not found');
    }
    const before = auditBudgetState(
      existingBudget,
      existingScopes.map(scope => scope.accountId),
    );
    const updateOp = existingBudget.prepareUpdate(record => {
      if (updates.name !== undefined) record.name = updates.name;
      if (updates.amount !== undefined) record.amount = updates.amount;
      if (updates.currencyCode !== undefined) record.currencyCode = updates.currencyCode;
      if (updates.startMonth !== undefined) record.startMonth = updates.startMonth;
      if (updates.intervalType !== undefined) record.intervalType = updates.intervalType;
      if (updates.intervalN !== undefined) record.intervalN = updates.intervalN;
      if (updates.startDate !== undefined) record.startDate = updates.startDate;
      if (updates.recurrenceDay !== undefined) record.recurrenceDay = updates.recurrenceDay;
      if (updates.recurrenceMonth !== undefined) record.recurrenceMonth = updates.recurrenceMonth;
      if (updates.active !== undefined) record.active = updates.active;
      if (updates.assetAccountIds !== undefined)
        record.assetAccountIds = persistFundingAccountIds(updates.assetAccountIds);
      record.updatedAt = new Date();
    });

    const existingAccountIdsSet = new Set(existingScopes.map(s => s.accountId));
    const accountIdsSet = new Set(accountIds);
    const toAdd = accountIds.filter(id => !existingAccountIdsSet.has(id));
    const toRemove = existingScopes.filter(s => !accountIdsSet.has(s.accountId));

    const addOps = toAdd.map(accountId =>
      budgetScopes.prepareCreate(scope => {
        scope.workplaceId = workplaceId;
        scope.budget.set(budget);
        scope.accountId = accountId;
        scope.createdAt = new Date();
        scope.updatedAt = new Date();
      }),
    );

    const removeOps = toRemove.map(scope => scope.prepareDestroyPermanently());

    const after = auditBudgetState(existingBudget, accountIds);
    await database.batch(
      updateOp,
      ...addOps,
      ...removeOps,
      auditRepository.prepareLog(
        {
          entityType: 'budget',
          entityId: existingBudget.id,
          eventType: 'budget.updated',
          action: AuditAction.UPDATE,
          changes: { before, after },
          undoable: true,
        },
        workplaceId,
      ),
    );
    return budget;
  });
}

export async function deleteBudget(workplaceId: WorkplaceId, budget: Budget): Promise<void> {
  const budgetScopes = budgetScopesCollection();
  return await database.write(async () => {
    const existingBudget = await findBudget(workplaceId, budget.id);
    if (!existingBudget) {
      throw new Error('Budget not found');
    }
    const scopes = await budgetScopes
      .query(Q.where('workplace_id', workplaceId), Q.where('budget_id', budget.id))
      .fetch();
    const removeScopes = scopes.map(s => s.prepareDestroyPermanently());
    const removeBudget = existingBudget.prepareDestroyPermanently();
    await database.batch(
      ...removeScopes,
      removeBudget,
      auditRepository.prepareLog(
        {
          entityType: 'budget',
          entityId: existingBudget.id,
          eventType: 'budget.deleted',
          action: AuditAction.DELETE,
          changes: {
            before: auditBudgetState(
              existingBudget,
              scopes.map(scope => scope.accountId),
            ),
          },
          undoable: true,
        },
        workplaceId,
      ),
    );
  });
}
