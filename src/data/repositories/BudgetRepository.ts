import { database } from '@/src/data/database/Database';
import Budget from '@/src/data/models/Budget';
import BudgetScope from '@/src/data/models/BudgetScope';
import { AccountId, BudgetId, WorkplaceId } from '@/src/types/ids';
import { Q } from '@nozbe/watermelondb';
import { map } from 'rxjs/operators';

export interface BudgetInput {
  name: string;
  amount: number;
  currencyCode: string;
  startMonth: string;
  intervalType?: string;
  intervalN?: number;
  startDate?: number;
  recurrenceDay?: number;
  recurrenceMonth?: number;
  active?: boolean;
  assetAccountIds?: AccountId[];
}

export class BudgetRepository {
  private get db() {
    return database;
  }

  private get budgets() {
    return this.db.collections.get<Budget>('budgets');
  }

  private get budgetScopes() {
    return this.db.collections.get<BudgetScope>('budget_scopes');
  }

  observeAllActive(workplaceId: WorkplaceId) {
    return this.budgets
      .query(
        Q.where('workplace_id', workplaceId),
        Q.where('active', true),
        Q.sortBy('start_month', Q.desc),
      )
      .observeWithColumns(['name', 'amount', 'currency_code', 'start_month', 'active']);
  }

  observeScopes(workplaceId: WorkplaceId, budgetId: BudgetId) {
    return this.budgetScopes
      .query(Q.where('workplace_id', workplaceId), Q.where('budget_id', budgetId))
      .observe();
  }

  async getScopes(workplaceId: WorkplaceId, budgetId: BudgetId): Promise<BudgetScope[]> {
    return await this.budgetScopes
      .query(Q.where('workplace_id', workplaceId), Q.where('budget_id', budgetId))
      .fetch();
  }

  async getScopesByBudgetIds(
    workplaceId: WorkplaceId,
    budgetIds: BudgetId[],
  ): Promise<BudgetScope[]> {
    if (budgetIds.length === 0) return [];
    return await this.budgetScopes
      .query(Q.where('workplace_id', workplaceId), Q.where('budget_id', Q.oneOf(budgetIds)))
      .fetch();
  }

  observeById(workplaceId: WorkplaceId, id: BudgetId) {
    return this.budgets
      .query(Q.where('workplace_id', workplaceId), Q.where('id', id))
      .observe()
      .pipe(map(budgets => budgets[0] || null));
  }

  async find(workplaceId: WorkplaceId, id: BudgetId): Promise<Budget | null> {
    try {
      const budget = await this.budgets.find(id);
      if (budget.workplaceId !== workplaceId) return null;
      return budget;
    } catch {
      return null;
    }
  }

  async create(
    workplaceId: WorkplaceId,
    data: BudgetInput,
    accountIds: AccountId[],
  ): Promise<Budget> {
    return await this.db.write(async () => {
      const budget = await this.budgets.create(record => {
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
        if (data.assetAccountIds) record.assetAccountIds = data.assetAccountIds.join(',');
        record.createdAt = new Date();
        record.updatedAt = new Date();
      });

      const scopeCreates = accountIds.map(accountId =>
        this.budgetScopes.prepareCreate(scope => {
          scope.workplaceId = workplaceId;
          scope.budget.set(budget);
          scope.accountId = accountId;
          scope.createdAt = new Date();
          scope.updatedAt = new Date();
        }),
      );

      await this.db.batch(scopeCreates);
      return budget;
    });
  }

  async update(
    workplaceId: WorkplaceId,
    budget: Budget,
    updates: Partial<BudgetInput>,
    accountIds: AccountId[],
  ): Promise<Budget> {
    return await this.db.write(async () => {
      const existingScopes = await this.budgetScopes
        .query(Q.where('workplace_id', workplaceId), Q.where('budget_id', budget.id))
        .fetch();

      //get budget to check it belongs to current workplaceId
      const existingBudget = await this.find(workplaceId, budget.id);
      if (!existingBudget) {
        throw new Error('Budget not found');
      }
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
          record.assetAccountIds = updates.assetAccountIds.join(',');
        record.updatedAt = new Date();
      });

      const existingAccountIdsSet = new Set(existingScopes.map(s => s.accountId));
      const accountIdsSet = new Set(accountIds);
      const toAdd = accountIds.filter(id => !existingAccountIdsSet.has(id));
      const toRemove = existingScopes.filter(s => !accountIdsSet.has(s.accountId));

      const addOps = toAdd.map(accountId =>
        this.budgetScopes.prepareCreate(scope => {
          scope.workplaceId = workplaceId;
          scope.budget.set(budget);
          scope.accountId = accountId;
          scope.createdAt = new Date();
          scope.updatedAt = new Date();
        }),
      );

      const removeOps = toRemove.map(scope => scope.prepareDestroyPermanently());

      await this.db.batch([updateOp, ...addOps, ...removeOps]);
      return budget;
    });
  }

  async delete(workplaceId: WorkplaceId, budget: Budget): Promise<void> {
    return await this.db.write(async () => {
      //get budget to check it belongs to current workplaceId
      const existingBudget = await this.find(workplaceId, budget.id);
      if (!existingBudget) {
        throw new Error('Budget not found');
      }
      const scopes = await this.budgetScopes
        .query(Q.where('workplace_id', workplaceId), Q.where('budget_id', budget.id))
        .fetch();
      const removeScopes = scopes.map(s => s.prepareDestroyPermanently());
      const removeBudget = existingBudget.prepareDestroyPermanently();
      await this.db.batch([...removeScopes, removeBudget]);
    });
  }

  async findAllScopesByAccountIds(
    workplaceId: WorkplaceId,
    accountIds: AccountId[],
  ): Promise<BudgetScope[]> {
    if (accountIds.length === 0) return [];
    return await this.budgetScopes
      .query(Q.where('workplace_id', workplaceId), Q.where('account_id', Q.oneOf(accountIds)))
      .fetch();
  }

  async findAllWithAssetAccountIds(workplaceId: WorkplaceId): Promise<Budget[]> {
    return await this.budgets
      .query(Q.where('workplace_id', workplaceId), Q.where('asset_account_ids', Q.notEq(null)))
      .fetch();
  }

  /** Budgets whose CSV funding list includes this account id. */
  async findAllReferencingAssetAccountId(
    workplaceId: WorkplaceId,
    accountId: AccountId,
  ): Promise<Budget[]> {
    return this.budgets
      .query(
        Q.where('workplace_id', workplaceId),
        Q.where('asset_account_ids', Q.like(`%${accountId}%`)),
      )
      .fetch();
  }

  /**
   * Prepares WatermelonDB operations to merge budget references from source accounts
   * into a target account.
   */
  async prepareMergeOperations(
    workplaceId: WorkplaceId,
    sourceAccountIds: AccountId[],
    targetAccountId: AccountId,
  ): Promise<(Budget | BudgetScope)[]> {
    const scopes = await this.findAllScopesByAccountIds(workplaceId, sourceAccountIds);
    const budgets = await this.findAllWithAssetAccountIds(workplaceId);

    const scopeOps = scopes.map(scope =>
      scope.prepareUpdate(record => {
        record.accountId = targetAccountId;
        record.updatedAt = new Date();
      }),
    );

    const sourceIds = new Set(sourceAccountIds);
    const budgetOps: Budget[] = [];
    for (const budget of budgets) {
      if (!budget.assetAccountIds) continue;

      let changed = false;
      const accountIds = budget.assetAccountIds
        .split(',')
        .map(id => id.trim())
        .filter(id => id.length > 0)
        .map(id => {
          if (sourceIds.has(id as AccountId)) {
            changed = true;
            return targetAccountId;
          }
          return id as AccountId;
        });

      if (changed) {
        budgetOps.push(
          budget.prepareUpdate(record => {
            record.assetAccountIds = [...new Set(accountIds)].join(',');
            record.updatedAt = new Date();
          }),
        );
      }
    }

    return [...scopeOps, ...budgetOps];
  }
}

export const budgetRepository = new BudgetRepository();
