import { AuditAction } from '@/src/data/models/AuditLog';
import { JournalStatus } from '@/src/data/models/Journal';
import { deleteAccount, recoverAccount } from '@/src/services/accounts/accountDeleteCommands';
import { revertAccountFromAuditState } from '@/src/services/accounts/accountAuditCommands';
import { journalService } from '@/src/services/journal/journalDomainService';
import { revertRegistry } from '@/src/services/revert-registry';
import {
  AccountAuditState,
  AccountId,
  JournalAuditState,
  JournalId,
  WorkplaceId,
} from '@/src/types/domain';

/**
 * Register all audit revert handlers.
 * Call once during app bootstrap (e.g. useAppBootstrap / bootstrap.ts).
 */

let registered = false;

export function registerAuditHandlers(): void {
  if (registered) return;
  registered = true;

  // Journal Handler
  revertRegistry.register(
    'journal',
    async (
      entityId,
      changes: { before?: JournalAuditState; after?: JournalAuditState },
      action,
      workplaceId: WorkplaceId,
    ) => {
      let entityIdCasted = entityId as JournalId;
      if (action === AuditAction.CREATE) {
        await journalService.deleteJournal(entityIdCasted, workplaceId);
      } else if (action === AuditAction.DELETE) {
        await journalService.recoverJournal(entityIdCasted, workplaceId);
      } else if (action === AuditAction.UPDATE) {
        if (changes.before) {
          if ('deletedAt' in changes.before) {
            await journalService.deleteJournal(entityIdCasted, workplaceId);
          } else if ('status' in changes.before && !changes.before.transactions) {
            if (changes.before.status === JournalStatus.PLANNED) {
              await journalService.revertToPlanned(entityIdCasted, workplaceId);
            } else if (changes.before.status === JournalStatus.POSTED) {
              await journalService.postJournal(entityIdCasted, workplaceId);
            }
          } else {
            const before = changes.before;
            // Map JournalAuditState to CreateJournalData
            // If these fields are missing, the revert will fail (which is appropriate for a data-driven revert)
            await journalService.updateJournal(
              entityIdCasted,
              {
                journalDate: before.journalDate!,
                description: before.description,
                currencyCode: before.currencyCode!,
                status: before.status as JournalStatus,
                transactions: before.transactions || [],
              },
              workplaceId,
            );
          }
        }
      }
    },
  );

  // Account Handler
  revertRegistry.register(
    'account',
    async (
      entityId,
      changes: { before?: AccountAuditState; after?: AccountAuditState },
      action,
      workplaceId: WorkplaceId,
    ) => {
      let entityIdCasted = entityId as AccountId;
      if (action === AuditAction.CREATE) {
        await deleteAccount(entityIdCasted, workplaceId);
      } else if (action === AuditAction.DELETE) {
        await recoverAccount(entityIdCasted, workplaceId);
      } else if (action === AuditAction.UPDATE) {
        if (changes.before) {
          if ('deletedAt' in changes.before) {
            await deleteAccount(entityIdCasted, workplaceId);
          } else {
            await revertAccountFromAuditState(workplaceId, entityIdCasted, changes.before);
          }
        }
      }
    },
  );
}
