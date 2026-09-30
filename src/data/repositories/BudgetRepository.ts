import { database } from '@/src/data/database/Database';
import {
  stageModelWrite,
  type AccountingWriteSession,
} from '@/src/data/repositories/AccountingWriteSession';
import Budget from '@/src/data/models/Budget';
import BudgetScope from '@/src/data/models/BudgetScope';
import { observeQueryWithModelChanges } from '@/src/data/repositories/observeQueryWithModelChanges';
import Account from '@/src/data/models/Account';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import { AuditAction } from '@/src/types/enums';
import { AccountId, BudgetId, WorkplaceId } from '@/src/types/ids';
import { Model, Q } from '@nozbe/watermelondb';
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

export type BudgetPatch = Partial<BudgetInput>;

export type BudgetMergeRecords = {
  scopes: BudgetScope[];
  budgets: Budget[];
};

interface BudgetAuditSnapshot extends Record<string, unknown> {
  name: string;
  amount: number;
  currencyCode: string;
  startMonth: string;
  intervalType: string;
  intervalN: number;
  startDate: number | null;
  recurrenceDay: number | null;
  recurrenceMonth: number | null;
  active: boolean;
  assetAccountIds: string[];
  scopedAccountIds: string[];
}

const BUDGET_AUDIT_FIELDS = [
  'name',
  'amount',
  'currencyCode',
  'startMonth',
  'intervalType',
  'intervalN',
  'startDate',
  'recurrenceDay',
  'recurrenceMonth',
  'active',
  'assetAccountIds',
  'scopedAccountIds',
] as const;

const BUDGET_REFERENCE_FIELDS = new Set(['assetAccountIds', 'scopedAccountIds']);
const BUDGET_REVERT_CONFLICT =
  'This budget changed after the selected history entry. Refresh and review the latest change.';

function stableAuditJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableAuditJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map(key => `${JSON.stringify(key)}:${stableAuditJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

function auditBudgetFieldMatches(field: string, actual: unknown, expected: unknown): boolean {
  if (BUDGET_REFERENCE_FIELDS.has(field) && Array.isArray(actual) && Array.isArray(expected)) {
    const normalize = (ids: unknown[]) =>
      ids.filter((id): id is string => typeof id === 'string').sort();
    return stableAuditJson(normalize(actual)) === stableAuditJson(normalize(expected));
  }
  return stableAuditJson(actual) === stableAuditJson(expected);
}

function readBudgetSnapshot(value: Record<string, unknown>): BudgetAuditSnapshot {
  const requiredStrings = ['name', 'currencyCode', 'startMonth', 'intervalType'] as const;
  if (
    requiredStrings.some(field => typeof value[field] !== 'string') ||
    typeof value.amount !== 'number' ||
    typeof value.intervalN !== 'number' ||
    typeof value.active !== 'boolean' ||
    !Array.isArray(value.assetAccountIds) ||
    !value.assetAccountIds.every(id => typeof id === 'string') ||
    !Array.isArray(value.scopedAccountIds) ||
    !value.scopedAccountIds.every(id => typeof id === 'string')
  ) {
    throw new Error(BUDGET_REVERT_CONFLICT);
  }

  const optionalNumber = (field: string): number | null => {
    const candidate = value[field];
    if (candidate === undefined || candidate === null) return null;
    if (typeof candidate !== 'number' || !Number.isFinite(candidate)) {
      throw new Error(BUDGET_REVERT_CONFLICT);
    }
    return candidate;
  };

  return {
    name: value.name as string,
    amount: value.amount,
    currencyCode: value.currencyCode as string,
    startMonth: value.startMonth as string,
    intervalType: value.intervalType as string,
    intervalN: value.intervalN,
    startDate: optionalNumber('startDate'),
    recurrenceDay: optionalNumber('recurrenceDay'),
    recurrenceMonth: optionalNumber('recurrenceMonth'),
    active: value.active,
    assetAccountIds: value.assetAccountIds as string[],
    scopedAccountIds: value.scopedAccountIds as string[],
  };
}

function auditBudgetState(
  budget: Budget,
  accountIds: readonly AccountId[],
): Record<string, unknown> {
  return {
    name: budget.name,
    amount: budget.amount,
    currencyCode: budget.currencyCode,
    startMonth: budget.startMonth,
    intervalType: budget.intervalType,
    intervalN: budget.intervalN,
    startDate: budget.startDate,
    recurrenceDay: budget.recurrenceDay,
    recurrenceMonth: budget.recurrenceMonth,
    active: budget.active,
    assetAccountIds: (budget.assetAccountIds ?? '')
      .split(',')
      .map(id => id.trim())
      .filter(Boolean),
    scopedAccountIds: [...accountIds],
  };
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
    return observeQueryWithModelChanges(
      this.budgets.query(
        Q.where('workplace_id', workplaceId),
        Q.where('active', true),
        Q.sortBy('start_month', Q.desc),
      ),
    );
  }

  observeScopes(workplaceId: WorkplaceId, budgetId: BudgetId) {
    return observeQueryWithModelChanges(
      this.budgetScopes.query(Q.where('workplace_id', workplaceId), Q.where('budget_id', budgetId)),
    );
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
    return observeQueryWithModelChanges(
      this.budgets.query(Q.where('workplace_id', workplaceId), Q.where('id', id)),
    ).pipe(map(budgets => budgets[0] || null));
  }

  async find(workplaceId: WorkplaceId, id: BudgetId): Promise<Budget | null> {
    const budgets = await this.budgets
      .query(Q.where('workplace_id', workplaceId), Q.where('id', id))
      .fetch();
    return budgets[0] ?? null;
  }

  observeByIds(workplaceId: WorkplaceId, ids: BudgetId[]) {
    return this.budgets
      .query(Q.where('workplace_id', workplaceId), Q.where('id', Q.oneOf(ids)))
      .observe();
  }

  async create(
    workplaceId: WorkplaceId,
    data: BudgetInput,
    accountIds: AccountId[],
    validateReferences?: () => Promise<unknown>,
  ): Promise<Budget> {
    return await this.db.write(async () => {
      await validateReferences?.();
      const budget = this.budgets.prepareCreate(record => {
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

      await this.db.batch(
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

  async update(
    workplaceId: WorkplaceId,
    budget: Budget,
    updates: BudgetPatch,
    accountIds: AccountId[],
    validateReferences?: () => Promise<unknown>,
  ): Promise<Budget> {
    return await this.db.write(async () => {
      await validateReferences?.();
      const existingScopes = await this.budgetScopes
        .query(Q.where('workplace_id', workplaceId), Q.where('budget_id', budget.id))
        .fetch();

      //get budget to check it belongs to current workplaceId
      const existingBudget = await this.find(workplaceId, budget.id);
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

      const after = auditBudgetState(existingBudget, accountIds);
      await this.db.batch(
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
      await this.db.batch(
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

  async revertAuditEntry(
    workplaceId: WorkplaceId,
    budgetId: BudgetId,
    action: AuditAction,
    before: Record<string, unknown> | undefined,
    after: Record<string, unknown> | undefined,
    changedFields: readonly string[],
    auditLogId: string,
  ): Promise<void> {
    await this.db.write(async () => {
      const budget = await this.find(workplaceId, budgetId);
      const scopes = budget
        ? await this.budgetScopes
            .query(Q.where('workplace_id', workplaceId), Q.where('budget_id', budgetId))
            .fetch()
        : [];
      const current = budget
        ? auditBudgetState(
            budget,
            scopes.map(scope => scope.accountId),
          )
        : undefined;

      if (action === AuditAction.CREATE) {
        if (!budget || !current || !after) throw new Error(BUDGET_REVERT_CONFLICT);
        for (const field of BUDGET_AUDIT_FIELDS) {
          if (
            !Object.prototype.hasOwnProperty.call(after, field) ||
            !auditBudgetFieldMatches(field, current[field], after[field])
          ) {
            throw new Error(BUDGET_REVERT_CONFLICT);
          }
        }
        await this.db.batch(
          ...scopes.map(scope => scope.prepareDestroyPermanently()),
          budget.prepareDestroyPermanently(),
          auditRepository.prepareLog(
            {
              entityType: 'budget',
              entityId: budgetId,
              eventType: 'budget.reverted',
              action: AuditAction.DELETE,
              source: 'app',
              revertsLogId: auditLogId,
              undoable: false,
              changes: { before: current, after: { deletedAt: new Date() } },
            },
            workplaceId,
          ),
        );
        return;
      }

      if (action === AuditAction.DELETE) {
        if (!before || current) throw new Error(BUDGET_REVERT_CONFLICT);
        const snapshot = readBudgetSnapshot(before);
        const idCollision = await this.budgets.query(Q.where('id', budgetId)).fetchCount();
        const orphanScopes = await this.budgetScopes
          .query(Q.where('budget_id', budgetId))
          .fetchCount();
        if (idCollision > 0 || orphanScopes > 0) throw new Error(BUDGET_REVERT_CONFLICT);
        await this.assertBudgetReferences(workplaceId, snapshot);

        const restored = this.budgets.prepareCreate(record => {
          record._raw.id = budgetId;
          record.workplaceId = workplaceId;
          this.assignSnapshot(record, snapshot);
          record.createdAt = new Date();
          record.updatedAt = new Date();
        });
        const restoredScopes = [...new Set(snapshot.scopedAccountIds)].map(accountId =>
          this.budgetScopes.prepareCreate(scope => {
            scope.workplaceId = workplaceId;
            scope.budget.set(restored);
            scope.accountId = accountId as AccountId;
            scope.createdAt = new Date();
            scope.updatedAt = new Date();
          }),
        );
        await this.db.batch(
          restored,
          ...restoredScopes,
          auditRepository.prepareLog(
            {
              entityType: 'budget',
              entityId: budgetId,
              eventType: 'budget.restored',
              action: AuditAction.CREATE,
              source: 'app',
              revertsLogId: auditLogId,
              undoable: false,
              changes: { after: snapshot },
            },
            workplaceId,
          ),
        );
        return;
      }

      if (
        action !== AuditAction.UPDATE ||
        !budget ||
        !current ||
        !before ||
        !after ||
        changedFields.length === 0
      ) {
        throw new Error(BUDGET_REVERT_CONFLICT);
      }

      const restoredValues: Record<string, unknown> = { ...current };
      for (const field of changedFields) {
        if (
          !BUDGET_AUDIT_FIELDS.includes(field as (typeof BUDGET_AUDIT_FIELDS)[number]) ||
          !Object.prototype.hasOwnProperty.call(before, field) ||
          !Object.prototype.hasOwnProperty.call(after, field) ||
          !auditBudgetFieldMatches(field, current[field], after[field])
        ) {
          throw new Error(BUDGET_REVERT_CONFLICT);
        }
        restoredValues[field] = before[field];
      }
      const restoredSnapshot = readBudgetSnapshot(restoredValues);
      await this.assertBudgetReferences(workplaceId, restoredSnapshot);

      const currentScopeIds = new Set(scopes.map(scope => scope.accountId));
      const restoredScopeIds = new Set(restoredSnapshot.scopedAccountIds as AccountId[]);
      const addedScopes = [...restoredScopeIds]
        .filter(accountId => !currentScopeIds.has(accountId))
        .map(accountId =>
          this.budgetScopes.prepareCreate(scope => {
            scope.workplaceId = workplaceId;
            scope.budget.set(budget);
            scope.accountId = accountId;
            scope.createdAt = new Date();
            scope.updatedAt = new Date();
          }),
        );
      const removedScopes = scopes
        .filter(scope => !restoredScopeIds.has(scope.accountId))
        .map(scope => scope.prepareDestroyPermanently());
      const now = new Date();

      await this.db.batch(
        budget.prepareUpdate(record => {
          this.assignSnapshot(record, restoredSnapshot);
          record.updatedAt = now;
        }),
        ...addedScopes,
        ...removedScopes,
        auditRepository.prepareLog(
          {
            entityType: 'budget',
            entityId: budgetId,
            eventType: 'budget.reverted',
            action: AuditAction.UPDATE,
            source: 'app',
            revertsLogId: auditLogId,
            undoable: false,
            changes: { before: current, after: restoredSnapshot },
          },
          workplaceId,
        ),
      );
    });
  }

  private assignSnapshot(record: Budget, snapshot: BudgetAuditSnapshot): void {
    record.name = snapshot.name;
    record.amount = snapshot.amount;
    record.currencyCode = snapshot.currencyCode;
    record.startMonth = snapshot.startMonth;
    record.intervalType = snapshot.intervalType;
    record.intervalN = snapshot.intervalN;
    record.startDate = snapshot.startDate ?? undefined;
    record.recurrenceDay = snapshot.recurrenceDay ?? undefined;
    record.recurrenceMonth = snapshot.recurrenceMonth ?? undefined;
    record.active = snapshot.active;
    record.assetAccountIds =
      snapshot.assetAccountIds.length > 0 ? snapshot.assetAccountIds.join(',') : undefined;
  }

  private async assertBudgetReferences(
    workplaceId: WorkplaceId,
    snapshot: BudgetAuditSnapshot,
  ): Promise<void> {
    const accountIds = [
      ...new Set([...snapshot.assetAccountIds, ...snapshot.scopedAccountIds]),
    ] as AccountId[];
    if (accountIds.length === 0) return;
    const accounts = await this.db.collections
      .get<Account>('accounts')
      .query(
        Q.where('workplace_id', workplaceId),
        Q.where('id', Q.oneOf(accountIds)),
        Q.where('deleted_at', Q.eq(null)),
      )
      .fetch();
    if (accounts.length !== accountIds.length) throw new Error(BUDGET_REVERT_CONFLICT);
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

  async findAllActive(workplaceId: WorkplaceId): Promise<Budget[]> {
    return this.budgets
      .query(Q.where('workplace_id', workplaceId), Q.where('active', true))
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
    const candidates = await this.budgets
      .query(Q.where('workplace_id', workplaceId), Q.where('asset_account_ids', Q.notEq(null)))
      .fetch();
    return candidates.filter(budget =>
      budget.assetAccountIds
        ?.split(',')
        .map(id => id.trim())
        .filter(Boolean)
        .includes(accountId),
    );
  }

  /**
   * Prepares WatermelonDB operations to merge budget references from source accounts
   * into a target account.
   */
  async mergeAccountsInSession(
    session: AccountingWriteSession,
    workplaceId: WorkplaceId,
    sourceAccountIds: AccountId[],
    targetAccountId: AccountId,
    correlationId?: string,
  ): Promise<void> {
    const records = await this.loadMergeRecords(workplaceId, sourceAccountIds, targetAccountId);
    stageModelWrite(session, () =>
      this.prepareLoadedMergeOperations(records, sourceAccountIds, targetAccountId, correlationId),
    );
  }

  private async loadMergeRecords(
    workplaceId: WorkplaceId,
    sourceAccountIds: AccountId[],
    targetAccountId: AccountId,
  ): Promise<BudgetMergeRecords> {
    const [affectedScopes, allBudgets] = await Promise.all([
      this.findAllScopesByAccountIds(workplaceId, [...sourceAccountIds, targetAccountId]),
      this.findAllWithAssetAccountIds(workplaceId),
    ]);
    const sourceIds = new Set(sourceAccountIds);
    const budgets = allBudgets.filter(budget =>
      (budget.assetAccountIds ?? '')
        .split(',')
        .map(id => id.trim())
        .some(id => sourceIds.has(id as AccountId)),
    );
    const budgetIds = [
      ...new Set([
        ...affectedScopes.map(scope => scope.budget.id),
        ...budgets.map(budget => budget.id),
      ]),
    ];
    if (budgetIds.length === 0) return { scopes: [], budgets: [] };
    const [allAffectedScopes, affectedBudgets] = await Promise.all([
      this.budgetScopes
        .query(Q.where('workplace_id', workplaceId), Q.where('budget_id', Q.oneOf(budgetIds)))
        .fetch(),
      this.budgets
        .query(Q.where('workplace_id', workplaceId), Q.where('id', Q.oneOf(budgetIds)))
        .fetch(),
    ]);
    return { scopes: allAffectedScopes, budgets: affectedBudgets };
  }

  private prepareLoadedMergeOperations(
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
            record.assetAccountIds = nextAssetAccountIds.join(',');
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
}

export const budgetRepository = new BudgetRepository();
