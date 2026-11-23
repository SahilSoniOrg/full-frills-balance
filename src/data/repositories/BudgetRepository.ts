import type { AccountingWriteSession } from '@/src/data/repositories/AccountingWriteSession';
import Budget from '@/src/data/models/Budget';
import BudgetScope from '@/src/data/models/BudgetScope';
import { AuditAction } from '@/src/types/enums';
import { AccountId, BudgetId, WorkplaceId } from '@/src/types/ids';
import { revertBudgetAuditEntry } from './budget/budgetAudit';
import {
  createBudget,
  createBudgetInSession,
  deleteBudget,
  findAllActiveBudgets,
  findAllBudgetsReferencingAssetAccountId,
  findAllBudgetsWithAssetAccountIds,
  findBudget,
  observeAllActiveBudgets,
  observeBudgetById,
  observeBudgetsByIds,
  updateBudget,
} from './budget/budgetCrud';
import { mergeBudgetAccountsInSession } from './budget/budgetMerge';
import {
  findAllScopesByAccountIds,
  getBudgetScopes,
  getBudgetScopesByBudgetIds,
  observeAllBudgetScopes,
  observeBudgetScopes,
} from './budget/budgetScope';
import type { BudgetInput, BudgetMergeRecords } from './budget/budgetTypes';

export type { BudgetInput, BudgetMergeRecords };

/** Thin façade over budget CRUD / scope / merge / audit modules. */
export class BudgetRepository {
  observeAllActive(workplaceId: WorkplaceId) {
    return observeAllActiveBudgets(workplaceId);
  }

  observeScopes(workplaceId: WorkplaceId, budgetId: BudgetId) {
    return observeBudgetScopes(workplaceId, budgetId);
  }

  observeAllScopes(workplaceId: WorkplaceId) {
    return observeAllBudgetScopes(workplaceId);
  }

  async getScopes(workplaceId: WorkplaceId, budgetId: BudgetId): Promise<BudgetScope[]> {
    return getBudgetScopes(workplaceId, budgetId);
  }

  async getScopesByBudgetIds(
    workplaceId: WorkplaceId,
    budgetIds: BudgetId[],
  ): Promise<BudgetScope[]> {
    return getBudgetScopesByBudgetIds(workplaceId, budgetIds);
  }

  observeById(workplaceId: WorkplaceId, id: BudgetId) {
    return observeBudgetById(workplaceId, id);
  }

  async find(workplaceId: WorkplaceId, id: BudgetId): Promise<Budget | null> {
    return findBudget(workplaceId, id);
  }

  observeByIds(workplaceId: WorkplaceId, ids: BudgetId[]) {
    return observeBudgetsByIds(workplaceId, ids);
  }

  async create(
    workplaceId: WorkplaceId,
    data: BudgetInput,
    accountIds: AccountId[],
    validateReferences?: () => Promise<unknown>,
  ): Promise<Budget> {
    return createBudget(workplaceId, data, accountIds, validateReferences);
  }

  async createInSession(
    session: AccountingWriteSession,
    workplaceId: WorkplaceId,
    id: BudgetId,
    data: BudgetInput,
    accountIds: AccountId[],
    correlationId?: string,
  ): Promise<Budget> {
    return createBudgetInSession(session, workplaceId, id, data, accountIds, correlationId);
  }

  async update(
    workplaceId: WorkplaceId,
    budget: Budget,
    updates: Partial<BudgetInput>,
    accountIds: AccountId[],
    validateReferences?: () => Promise<unknown>,
  ): Promise<Budget> {
    return updateBudget(workplaceId, budget, updates, accountIds, validateReferences);
  }

  async delete(workplaceId: WorkplaceId, budget: Budget): Promise<void> {
    return deleteBudget(workplaceId, budget);
  }

  async revertAuditEntry(
    workplaceId: WorkplaceId,
    budgetId: BudgetId,
    action: AuditAction,
    before: Record<string, unknown> | undefined,
    after: Record<string, unknown> | undefined,
    changedFields: readonly string[],
    auditLogId: string,
  ): Promise<void> {
    return revertBudgetAuditEntry(
      workplaceId,
      budgetId,
      action,
      before,
      after,
      changedFields,
      auditLogId,
    );
  }

  async findAllScopesByAccountIds(
    workplaceId: WorkplaceId,
    accountIds: AccountId[],
  ): Promise<BudgetScope[]> {
    return findAllScopesByAccountIds(workplaceId, accountIds);
  }

  async findAllActive(workplaceId: WorkplaceId): Promise<Budget[]> {
    return findAllActiveBudgets(workplaceId);
  }

  async findAllWithAssetAccountIds(workplaceId: WorkplaceId): Promise<Budget[]> {
    return findAllBudgetsWithAssetAccountIds(workplaceId);
  }

  async findAllReferencingAssetAccountId(
    workplaceId: WorkplaceId,
    accountId: AccountId,
  ): Promise<Budget[]> {
    return findAllBudgetsReferencingAssetAccountId(workplaceId, accountId);
  }

  async mergeAccountsInSession(
    session: AccountingWriteSession,
    workplaceId: WorkplaceId,
    sourceAccountIds: AccountId[],
    targetAccountId: AccountId,
    correlationId?: string,
  ): Promise<void> {
    return mergeBudgetAccountsInSession(
      session,
      workplaceId,
      sourceAccountIds,
      targetAccountId,
      {
        findAllScopesByAccountIds: (wp, ids) => this.findAllScopesByAccountIds(wp, ids),
        findAllWithAssetAccountIds: wp => this.findAllWithAssetAccountIds(wp),
      },
      correlationId,
    );
  }
}

export const budgetRepository = new BudgetRepository();
