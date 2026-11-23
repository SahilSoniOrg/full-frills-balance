import { database } from '@/src/data/database/Database';
import Account from '@/src/data/models/Account';
import Budget from '@/src/data/models/Budget';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import { restoreAuditFieldsFromRevert } from '@/src/data/repositories/auditRevertSupport';
import { stableAuditJson } from '@/src/domain/audit/stableAuditJson';
import {
  parseFundingAccountIds,
  persistFundingAccountIds,
} from '@/src/services/budget/budgetAssetAccountIds';
import { AuditAction } from '@/src/types/enums';
import { AccountId, BudgetId, WorkplaceId } from '@/src/types/ids';
import { Q } from '@nozbe/watermelondb';
import type { BudgetAuditSnapshot } from './budgetTypes';
import { budgetsCollection, budgetScopesCollection } from './budgetCollections';

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
export const BUDGET_REVERT_CONFLICT =
  'This budget changed after the selected history entry. Refresh and review the latest change.';

export function auditBudgetFieldMatches(
  field: string,
  actual: unknown,
  expected: unknown,
): boolean {
  if (BUDGET_REFERENCE_FIELDS.has(field) && Array.isArray(actual) && Array.isArray(expected)) {
    const normalize = (ids: unknown[]) =>
      ids.filter((id): id is string => typeof id === 'string').sort();
    return stableAuditJson(normalize(actual)) === stableAuditJson(normalize(expected));
  }
  return stableAuditJson(actual) === stableAuditJson(expected);
}

export function readBudgetSnapshot(value: Record<string, unknown>): BudgetAuditSnapshot {
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

export function auditBudgetState(
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
    assetAccountIds: parseFundingAccountIds(budget.assetAccountIds),
    scopedAccountIds: [...accountIds],
  };
}

export function assignBudgetSnapshot(record: Budget, snapshot: BudgetAuditSnapshot): void {
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
    snapshot.assetAccountIds.length > 0
      ? persistFundingAccountIds(snapshot.assetAccountIds)
      : undefined;
}

export async function assertBudgetReferences(
  workplaceId: WorkplaceId,
  snapshot: BudgetAuditSnapshot,
): Promise<void> {
  const accountIds = [
    ...new Set([...snapshot.assetAccountIds, ...snapshot.scopedAccountIds]),
  ] as AccountId[];
  if (accountIds.length === 0) return;
  const accounts = await database.collections
    .get<Account>('accounts')
    .query(
      Q.where('workplace_id', workplaceId),
      Q.where('id', Q.oneOf(accountIds)),
      Q.where('deleted_at', Q.eq(null)),
    )
    .fetch();
  if (accounts.length !== accountIds.length) throw new Error(BUDGET_REVERT_CONFLICT);
}

export async function revertBudgetAuditEntry(
  workplaceId: WorkplaceId,
  budgetId: BudgetId,
  action: AuditAction,
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
  changedFields: readonly string[],
  auditLogId: string,
): Promise<void> {
  const budgets = budgetsCollection();
  const budgetScopes = budgetScopesCollection();

  await database.write(async () => {
    const [budget] = await budgets
      .query(Q.where('workplace_id', workplaceId), Q.where('id', budgetId))
      .fetch();
    const scopes = budget
      ? await budgetScopes
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
      await database.batch(
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
      const idCollision = await budgets.query(Q.where('id', budgetId)).fetchCount();
      const orphanScopes = await budgetScopes.query(Q.where('budget_id', budgetId)).fetchCount();
      if (idCollision > 0 || orphanScopes > 0) throw new Error(BUDGET_REVERT_CONFLICT);
      await assertBudgetReferences(workplaceId, snapshot);

      const restored = budgets.prepareCreate(record => {
        record._raw.id = budgetId;
        record.workplaceId = workplaceId;
        assignBudgetSnapshot(record, snapshot);
        record.createdAt = new Date();
        record.updatedAt = new Date();
      });
      const restoredScopes = [...new Set(snapshot.scopedAccountIds)].map(accountId =>
        budgetScopes.prepareCreate(scope => {
          scope.workplaceId = workplaceId;
          scope.budget.set(restored);
          scope.accountId = accountId as AccountId;
          scope.createdAt = new Date();
          scope.updatedAt = new Date();
        }),
      );
      await database.batch(
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

    const restoredValues = restoreAuditFieldsFromRevert(
      current,
      before,
      after,
      changedFields,
      BUDGET_AUDIT_FIELDS,
      BUDGET_REVERT_CONFLICT,
      auditBudgetFieldMatches,
    );
    const restoredSnapshot = readBudgetSnapshot(restoredValues);
    await assertBudgetReferences(workplaceId, restoredSnapshot);

    const currentScopeIds = new Set(scopes.map(scope => scope.accountId));
    const restoredScopeIds = new Set(restoredSnapshot.scopedAccountIds as AccountId[]);
    const addedScopes = [...restoredScopeIds]
      .filter(accountId => !currentScopeIds.has(accountId))
      .map(accountId =>
        budgetScopes.prepareCreate(scope => {
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

    await database.batch(
      budget.prepareUpdate(record => {
        assignBudgetSnapshot(record, restoredSnapshot);
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
