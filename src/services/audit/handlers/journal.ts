import { journalService } from '@/src/services/journal/journalDomainService';
import { journalPersistenceService } from '@/src/services/journal/JournalPersistenceService';
import { runAccountingWriteSession } from '@/src/data/repositories/AccountingWriteSession';
import { journalPersistenceRepository } from '@/src/data/repositories/journal/JournalPersistenceRepository';
import { journalQueryRepository } from '@/src/data/repositories/journal/journalQueryRepository';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import { REVERT_CONFLICT_MESSAGE } from '@/src/domain/audit/revertErrors';
import { revertRegistry, type RevertCapability } from '@/src/services/revert-registry';
import { TransactionAuditState } from '@/src/types/audit';
import { JournalId } from '@/src/types/ids';
import { AuditAction, JournalStatus } from '@/src/types/enums';
import type { AuditJsonObject } from '@/src/types/auditEvents';
import { stableAuditJson } from '@/src/domain/audit/stableAuditJson';
import {
  type AuditChanges,
  asRecord,
  capabilityForFields,
  eventFieldNames,
  expectedJournalFields,
  journalRevertibleFields,
  matchesCurrentJournal,
  matchesSnapshot,
  normalizedJournalSnapshot,
} from './shared';

const canRevertJournal: RevertCapability = (action, rawChanges) => {
  const changes = rawChanges as AuditChanges;
  if (
    changes.eventType === 'journal.reversed' ||
    changes.eventType === 'journal.reversal_created' ||
    changes.eventType === 'journal.planned_payment_generated' ||
    changes.eventType === 'journal.planned_payment_skipped' ||
    changes.eventType === 'journal.sms_auto_posted' ||
    changes.eventType === 'journal.automatically_captured' ||
    changes.eventType === 'journal.opening_balance_created'
  ) {
    return false;
  }
  if (changes.eventType === 'journal.planned_payment_attached' && action === AuditAction.UPDATE) {
    return !!changes.before && !!changes.after;
  }
  return capabilityForFields(journalRevertibleFields)(action, rawChanges);
};

export function registerJournalAuditHandler(): void {
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
      if (changes.eventType === 'journal.planned_payment_attached') {
        await runAccountingWriteSession(session =>
          journalPersistenceRepository.undoPlanAttachInSession(
            session,
            workplaceId,
            journalId,
            {
              before: asRecord(changes.before) as AuditJsonObject | undefined,
              after: asRecord(changes.after) as AuditJsonObject | undefined,
            },
            { source: 'app', revertsLogId: context?.auditLogId },
          ),
        );
        return true;
      }
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
}
