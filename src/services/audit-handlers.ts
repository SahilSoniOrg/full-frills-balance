import { deleteAccount, recoverAccount } from '@/src/services/accounts/accountDeleteCommands';
import {
  accountMatchesAuditSnapshot,
  revertAccountFromAuditState,
} from '@/src/services/accounts/accountAuditCommands';
import { journalService } from '@/src/services/journal/journalDomainService';
import { journalPersistenceService } from '@/src/services/journal/JournalPersistenceService';
import { journalQueryRepository } from '@/src/data/repositories/journal/journalQueryRepository';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { AUDIT_ENTITY_CAPABILITIES } from '@/src/types/auditEntityCapabilities';
import {
  ACCOUNT_REVERT_CONFLICT_MESSAGE,
  REVERT_CONFLICT_MESSAGE,
  WORKPLACE_REVERT_CONFLICT_MESSAGE,
  revertRegistry,
  type RevertCapability,
} from '@/src/services/revert-registry';
import { AccountAuditState, TransactionAuditState } from '@/src/types/audit';
import { AccountId, BudgetId, JournalId, PlannedPaymentId, WorkplaceId } from '@/src/types/ids';
import { AuditAction, JournalStatus } from '@/src/types/enums';
import { getAuditEventFieldDeltas, isAuditEventPayload } from '@/src/types/auditEvents';
import { stableAuditJson } from '@/src/utils/stableAuditJson';

type AuditChanges = Record<string, unknown> & {
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  fields?: Record<string, unknown>;
  eventType?: string;
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function eventFieldNames(changes: AuditChanges): string[] {
  if (isAuditEventPayload(changes)) {
    return Object.keys(getAuditEventFieldDeltas(changes));
  }
  const fields = asRecord(changes.fields);
  if (fields) return Object.keys(fields);
  const after = asRecord(changes.after);
  if (after) return Object.keys(after).filter(key => key !== 'action');
  const before = asRecord(changes.before);
  return before ? Object.keys(before).filter(key => key !== 'action') : [];
}

function expectedJournalFields(changes: AuditChanges): Record<string, unknown> {
  const after = asRecord(changes.after);
  if (!after) return {};
  return Object.fromEntries(
    eventFieldNames(changes)
      .filter(field => Object.prototype.hasOwnProperty.call(after, field))
      .map(field => [field, after[field]]),
  );
}

function capabilityForFields(allowed: ReadonlySet<string>): RevertCapability {
  return (action, rawChanges) => {
    if (action === AuditAction.CREATE || action === AuditAction.DELETE) return true;
    const changes = rawChanges as AuditChanges;
    if (!changes.before) return false;
    if ('deletedAt' in changes.before) return true;
    const fields = eventFieldNames(changes);
    return fields.length > 0 && fields.every(field => allowed.has(field));
  };
}

const accountRevertibleFields = new Set([
  'name',
  'accountType',
  'accountSubtype',
  'currencyCode',
  'description',
  'icon',
  'color',
  'parentAccountId',
  'orderNum',
  'reconciledAt',
  'deletedAt',
  'archivedAt',
  'metadata',
]);

const journalRevertibleFields = new Set([
  'description',
  'notes',
  'journalDate',
  'currencyCode',
  'status',
  'totalAmount',
  'transactions',
  'deletedAt',
]);
const workplaceRevertibleFields = new Set(['name', 'icon', 'defaultCurrencyCode']);
const budgetRevertibleFields = new Set([
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
]);
const plannedPaymentRevertibleFields = new Set([
  'name',
  'description',
  'amount',
  'currencyCode',
  'fxMode',
  'destinationAmount',
  'fromAccountId',
  'toAccountId',
  'intervalN',
  'intervalType',
  'startDate',
  'endDate',
  'nextOccurrence',
  'isAutoPost',
  'recurrenceDay',
  'recurrenceMonth',
]);

const canRevertAccount: RevertCapability = (action, rawChanges) => {
  if (action !== AuditAction.CREATE) {
    return capabilityForFields(accountRevertibleFields)(action, rawChanges);
  }
  const after = asRecord(rawChanges.after);
  if (!after) return false;
  const initialBalance = after.initialBalance;
  return initialBalance == null || initialBalance === 0;
};
const canRevertJournal: RevertCapability = (action, rawChanges) => {
  const changes = rawChanges as AuditChanges;
  if (
    changes.eventType === 'journal.reversed' ||
    changes.eventType === 'journal.reversal_created' ||
    changes.eventType === 'journal.planned_payment_generated' ||
    changes.eventType === 'journal.planned_payment_skipped' ||
    changes.eventType === 'journal.sms_auto_posted' ||
    changes.eventType === 'journal.opening_balance_created'
  ) {
    return false;
  }
  return capabilityForFields(journalRevertibleFields)(action, rawChanges);
};
const canRevertWorkplace: RevertCapability = (action, rawChanges) => {
  if (action !== AuditAction.UPDATE) return false;
  const changes = rawChanges as AuditChanges;
  const fields = eventFieldNames(changes);
  return (
    !!changes.before &&
    !!changes.after &&
    fields.length > 0 &&
    fields.every(field => workplaceRevertibleFields.has(field))
  );
};
const canRevertBudget: RevertCapability = (action, rawChanges) => {
  const changes = rawChanges as AuditChanges;
  if (action === AuditAction.CREATE) {
    return (
      (!changes.eventType ||
        changes.eventType === 'budget.create' ||
        changes.eventType === 'budget.created') &&
      !!asRecord(changes.after)
    );
  }
  if (action === AuditAction.DELETE) {
    return (
      (!changes.eventType ||
        changes.eventType === 'budget.delete' ||
        changes.eventType === 'budget.deleted') &&
      !!asRecord(changes.before)
    );
  }
  if (
    action !== AuditAction.UPDATE ||
    !changes.before ||
    (changes.eventType !== undefined &&
      changes.eventType !== 'budget.update' &&
      changes.eventType !== 'budget.updated')
  ) {
    return false;
  }
  const fields = eventFieldNames(changes);
  return fields.length > 0 && fields.every(field => budgetRevertibleFields.has(field));
};
const canRevertPlannedPayment: RevertCapability = (action, rawChanges) => {
  const changes = rawChanges as AuditChanges;
  if (
    action !== AuditAction.UPDATE ||
    changes.eventType !== 'planned_payment.updated' ||
    !changes.before ||
    !asRecord(changes.after)
  ) {
    return false;
  }
  const fields = eventFieldNames(changes);
  return fields.length > 0 && fields.every(field => plannedPaymentRevertibleFields.has(field));
};

function normalizedJournalSnapshot(
  journal: Awaited<ReturnType<typeof journalQueryRepository.find>>,
  transactions: Awaited<ReturnType<typeof transactionQueryRepository.findByJournal>>,
): Record<string, unknown> {
  if (!journal) return {};
  return {
    description: journal.description ?? null,
    notes: journal.notes ?? null,
    journalDate: journal.journalDate,
    currencyCode: journal.currencyCode,
    status: journal.status,
    totalAmount: journal.totalAmount,
    transactions: transactions.map(transaction => ({
      accountId: transaction.accountId,
      amount: transaction.amount,
      transactionType: transaction.transactionType,
      notes: transaction.notes ?? null,
      exchangeRate: transaction.exchangeRate ?? null,
      currencyCode: transaction.currencyCode ?? null,
    })),
  };
}

function equalAuditValue(field: string, left: unknown, right: unknown): boolean {
  if (field === 'transactions' && Array.isArray(left) && Array.isArray(right)) {
    const sortLines = (lines: unknown[]) =>
      [...lines].sort((a, b) => stableAuditJson(a).localeCompare(stableAuditJson(b)));
    return stableAuditJson(sortLines(left)) === stableAuditJson(sortLines(right));
  }
  return stableAuditJson(left) === stableAuditJson(right);
}

function matchesCurrentJournal(changes: AuditChanges, current: Record<string, unknown>): boolean {
  const expected = asRecord(changes.after);
  if (!expected) return true;
  const fields = eventFieldNames(changes);
  for (const field of fields) {
    if (!(field in expected)) continue;
    if (!equalAuditValue(field, current[field], expected[field])) return false;
  }
  return true;
}

function matchesSnapshot(
  expected: Record<string, unknown>,
  current: Record<string, unknown>,
): boolean {
  return Object.entries(expected)
    .filter(([field]) => field !== 'action')
    .every(([field, value]) => equalAuditValue(field, current[field], value));
}

/** Register event-specific undo behavior and capability checks at app bootstrap. */
let registered = false;

export function registerAuditHandlers(): void {
  if (registered) return;

  revertRegistry.register(
    'journal',
    async (entityId, rawChanges, action, workplaceId, context) => {
      const changes = rawChanges as AuditChanges;
      const journalId = entityId as JournalId;
      if (action === AuditAction.CREATE) {
        const expected = asRecord(changes.after) ?? asRecord(changes);
        const journal = await journalQueryRepository.find(workplaceId, journalId);
        const transactions = await transactionQueryRepository.findByJournal(workplaceId, journalId);
        if (
          !expected ||
          !journal ||
          !matchesSnapshot(expected, normalizedJournalSnapshot(journal, transactions))
        ) {
          throw new Error(REVERT_CONFLICT_MESSAGE);
        }
        await journalService.deleteJournal(
          journalId,
          workplaceId,
          {
            source: 'app',
            revertsLogId: context?.auditLogId,
          },
          expected,
        );
        return true;
      }
      if (action === AuditAction.DELETE) {
        const before = asRecord(changes.before);
        const after = asRecord(changes.after);
        const journal = await journalQueryRepository.findWithDeleted(workplaceId, journalId);
        if (!before || !journal?.deletedAt) {
          throw new Error(REVERT_CONFLICT_MESSAGE);
        }
        if (
          after?.deletedAt !== undefined &&
          stableAuditJson(journal.deletedAt.toISOString()) !== stableAuditJson(after.deletedAt)
        ) {
          throw new Error(REVERT_CONFLICT_MESSAGE);
        }
        const deletedTransactions = (
          await transactionQueryRepository.findByJournalIncludingDeleted(workplaceId, journalId)
        ).filter(transaction => transaction.deletedAt?.getTime() === journal.deletedAt!.getTime());
        if (!matchesSnapshot(before, normalizedJournalSnapshot(journal, deletedTransactions))) {
          throw new Error(REVERT_CONFLICT_MESSAGE);
        }
        await journalService.recoverJournal(
          journalId,
          workplaceId,
          {
            source: 'app',
            revertsLogId: context?.auditLogId,
          },
          { ...before, ...(after?.deletedAt !== undefined ? { deletedAt: after.deletedAt } : {}) },
        );
        return true;
      }
      if (action !== AuditAction.UPDATE || !changes.before) return false;

      if ('deletedAt' in changes.before) {
        const restoredJournal = await journalQueryRepository.find(workplaceId, journalId);
        const restoredAt = asRecord(changes.after)?.restoredAt;
        if (
          !restoredJournal ||
          (typeof restoredAt === 'string' && restoredJournal.updatedAt.toISOString() !== restoredAt)
        ) {
          throw new Error(REVERT_CONFLICT_MESSAGE);
        }
        await journalService.deleteJournal(
          journalId,
          workplaceId,
          {
            source: 'app',
            revertsLogId: context?.auditLogId,
          },
          typeof restoredAt === 'string' ? { updatedAt: restoredAt } : undefined,
        );
        return true;
      }

      const before = changes.before;
      if (changes.eventType === 'journal.reversed') return false;
      const currentJournal = await journalQueryRepository.find(workplaceId, journalId);
      if (!currentJournal) throw new Error('Journal not found');
      const currentTransactions = await transactionQueryRepository.findByJournal(
        workplaceId,
        journalId,
      );
      const current = normalizedJournalSnapshot(currentJournal, currentTransactions);
      let expectedCurrent = expectedJournalFields(changes);
      if (!matchesCurrentJournal(changes, current)) {
        // Restore/import history entries describe the imported baseline; they are not later
        // journal edits. Allow the selected edit to revert only when that baseline exactly
        // matches the current journal and no real journal event followed the selected edit.
        const logs = await auditRepository.findByEntity('journal', journalId, workplaceId);
        const selectedIndex = logs.findIndex(log => log.id === context?.auditLogId);
        const laterLogs = selectedIndex < 0 ? [] : logs.slice(0, selectedIndex);
        const isImportedMarker = (log: (typeof logs)[number]) =>
          log.eventType === 'journal.imported' &&
          log.action === AuditAction.CREATE &&
          log.source === 'import';
        const importedAfter =
          laterLogs.length > 0 && laterLogs.every(isImportedMarker)
            ? asRecord(asRecord(laterLogs[0].parsedChanges)?.after)
            : undefined;
        const snapshotFields = [
          'description',
          'notes',
          'journalDate',
          'currencyCode',
          'status',
          'totalAmount',
          'transactions',
        ];
        const importedSnapshot = importedAfter
          ? Object.fromEntries(
              snapshotFields
                .filter(field => Object.prototype.hasOwnProperty.call(importedAfter, field))
                .map(field => [field, importedAfter[field]]),
            )
          : undefined;
        if (
          !importedSnapshot ||
          Object.keys(importedSnapshot).length !== snapshotFields.length ||
          !matchesCurrentJournal({ after: importedSnapshot }, current)
        ) {
          throw new Error(REVERT_CONFLICT_MESSAGE);
        }
        expectedCurrent = importedSnapshot;
      }

      const statusOnlyChange = eventFieldNames(changes).every(
        field => field === 'status' || field === 'journalDate',
      );
      const legacyStatusChange = changes.eventType === undefined && statusOnlyChange;
      if (
        before.status === JournalStatus.PLANNED &&
        statusOnlyChange &&
        (changes.eventType === 'journal.posted' ||
          (legacyStatusChange && currentJournal.status === JournalStatus.POSTED))
      ) {
        await journalService.revertToPlanned(
          journalId,
          workplaceId,
          {
            source: 'app',
            revertsLogId: context?.auditLogId,
          },
          expectedCurrent,
        );
        return true;
      }
      if (
        before.status === JournalStatus.POSTED &&
        statusOnlyChange &&
        (changes.eventType === 'journal.reverted_to_planned' ||
          (legacyStatusChange && currentJournal.status === JournalStatus.PLANNED))
      ) {
        // Undo restores the recorded posting; it must retain native lines and saved FX,
        // rather than apply a new occurrence's review policy or fetch today's market rate.
        await journalPersistenceService.post(
          journalId,
          workplaceId,
          typeof before.journalDate === 'number' ? before.journalDate : undefined,
          { source: 'app', revertsLogId: context?.auditLogId },
          expectedCurrent,
        );
        return true;
      }

      const getBefore = (field: string) =>
        Object.prototype.hasOwnProperty.call(before, field) ? before[field] : current[field];
      const transactions = Array.isArray(getBefore('transactions'))
        ? (getBefore('transactions') as TransactionAuditState[])
        : currentTransactions.map(transaction => ({
            accountId: transaction.accountId,
            amount: transaction.amount,
            transactionType: transaction.transactionType,
            notes: transaction.notes ?? undefined,
            exchangeRate: transaction.exchangeRate ?? undefined,
            currencyCode: transaction.currencyCode ?? undefined,
          }));

      await journalService.updateJournal(
        journalId,
        {
          journalDate: (getBefore('journalDate') ?? currentJournal.journalDate) as number,
          description:
            getBefore('description') === null
              ? undefined
              : (getBefore('description') as string | undefined),
          notes:
            getBefore('notes') === null ? undefined : (getBefore('notes') as string | undefined),
          currencyCode: (getBefore('currencyCode') ?? currentJournal.currencyCode) as string,
          status: (getBefore('status') ?? currentJournal.status) as JournalStatus,
          transactions,
        },
        workplaceId,
        {
          eventType: 'journal.reverted',
          source: 'app',
          revertsLogId: context?.auditLogId,
        },
        expectedCurrent,
      );
      return true;
    },
    canRevertJournal,
  );

  revertRegistry.register(
    'account',
    async (entityId, rawChanges, action, workplaceId, context) => {
      const changes = rawChanges as AuditChanges;
      const accountId = entityId as AccountId;
      if (action === AuditAction.CREATE) {
        const after = asRecord(changes.after);
        if (
          !after ||
          !(await accountMatchesAuditSnapshot(
            workplaceId,
            accountId,
            { ...after, deletedAt: null },
            ['initialBalance'],
          ))
        ) {
          throw new Error(ACCOUNT_REVERT_CONFLICT_MESSAGE);
        }
        await deleteAccount(accountId, workplaceId, {
          revertsLogId: context?.auditLogId,
          expectedCurrent: { ...after, deletedAt: null },
          ignoredExpectedFields: ['initialBalance'],
        });
        return true;
      }
      if (action === AuditAction.DELETE) {
        const before = asRecord(changes.before);
        const after = asRecord(changes.after);
        if (
          !before ||
          !after ||
          !(await accountMatchesAuditSnapshot(workplaceId, accountId, before, ['deletedAt'])) ||
          !(await accountMatchesAuditSnapshot(workplaceId, accountId, after))
        ) {
          throw new Error(ACCOUNT_REVERT_CONFLICT_MESSAGE);
        }
        await recoverAccount(accountId, workplaceId, {
          revertsLogId: context?.auditLogId,
          expectedCurrent: { ...before, ...after },
        });
        return true;
      }
      if (action !== AuditAction.UPDATE || !changes.before) return false;
      if ('deletedAt' in changes.before) {
        if (
          !changes.after ||
          !(await accountMatchesAuditSnapshot(workplaceId, accountId, changes.after))
        ) {
          throw new Error(ACCOUNT_REVERT_CONFLICT_MESSAGE);
        }
        await deleteAccount(accountId, workplaceId, {
          revertsLogId: context?.auditLogId,
          expectedCurrent: changes.after,
        });
        return true;
      }

      return revertAccountFromAuditState(
        workplaceId,
        accountId,
        changes.before as AccountAuditState,
        {
          changedFields: eventFieldNames(changes),
          expectedAfter: changes.after,
          auditLogId: context?.auditLogId,
        },
      );
    },
    canRevertAccount,
  );

  revertRegistry.register(
    'budget',
    async (entityId, rawChanges, action, workplaceId, context) => {
      const changes = rawChanges as AuditChanges;
      if (!context?.auditLogId)
        throw new Error('The selected history entry could not be identified.');
      await budgetRepository.revertAuditEntry(
        workplaceId,
        entityId as BudgetId,
        action as AuditAction,
        asRecord(changes.before),
        asRecord(changes.after),
        eventFieldNames(changes),
        context.auditLogId,
      );
      return true;
    },
    canRevertBudget,
  );

  revertRegistry.register(
    'planned_payment',
    async (entityId, rawChanges, action, workplaceId, context) => {
      const changes = rawChanges as AuditChanges;
      const before = asRecord(changes.before);
      const after = asRecord(changes.after);
      if (action !== AuditAction.UPDATE || !before || !after || !context?.auditLogId) {
        return false;
      }
      await plannedPaymentRepository.revertAuditUpdate(
        workplaceId,
        entityId as PlannedPaymentId,
        before,
        after,
        eventFieldNames(changes),
        context.auditLogId,
      );
      return true;
    },
    canRevertPlannedPayment,
  );

  revertRegistry.register(
    'workplace',
    async (entityId, rawChanges, action, workplaceId, context) => {
      if (action !== AuditAction.UPDATE) return false;
      const changes = rawChanges as AuditChanges;
      const before = asRecord(changes.before);
      const after = asRecord(changes.after);
      const fields = eventFieldNames(changes);
      const workplace = await workplaceRepository.find(entityId as WorkplaceId);
      if (!before || !after || !workplace || workplace.id !== workplaceId) {
        throw new Error(WORKPLACE_REVERT_CONFLICT_MESSAGE);
      }

      const patch: Partial<{
        name: string;
        icon: string;
        defaultCurrencyCode: string;
      }> = {};
      const expectedCurrent: Partial<typeof patch> = {};
      for (const field of fields) {
        if (!workplaceRevertibleFields.has(field)) return false;
        const previous = before[field];
        const expectedValue = after[field];
        if (typeof previous !== 'string' || typeof expectedValue !== 'string') {
          throw new Error(WORKPLACE_REVERT_CONFLICT_MESSAGE);
        }
        patch[field as keyof typeof patch] = previous;
        expectedCurrent[field as keyof typeof expectedCurrent] = expectedValue;
      }

      if (fields.length === 0) return false;
      await workplaceRepository.update(workplace, patch, {
        source: 'app',
        eventType: 'workplace.reverted',
        undoable: false,
        revertsLogId: context?.auditLogId,
        expectedCurrent,
      });
      return true;
    },
    canRevertWorkplace,
  );

  const declaredHandlers = Object.entries(AUDIT_ENTITY_CAPABILITIES)
    .filter(([, capability]) => capability.revertHandler !== 'none')
    .map(([entityType]) => entityType)
    .sort();
  const registeredHandlers = revertRegistry.getRegisteredEntityTypes();
  if (JSON.stringify(declaredHandlers) !== JSON.stringify(registeredHandlers)) {
    throw new Error(
      `Audit revert registry does not match entity capabilities (declared: ${declaredHandlers.join(', ')}; registered: ${registeredHandlers.join(', ')})`,
    );
  }
  registered = true;
}
